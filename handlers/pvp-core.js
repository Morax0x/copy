const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors } = require("discord.js");
const path = require('path');

const rootDir = process.cwd();
const weaponsConfig = require(path.join(rootDir, 'json', 'weapons-config.json'));
const skillsConfig = require(path.join(rootDir, 'json', 'skills-config.json'));

const EMOJI_MORA = '<:mora:1435647151349698621>';
const BASE_HP = 100;
const HP_PER_LEVEL = 4;
const SKILL_COOLDOWN_TURNS = 3;

const activePvpChallenges = new Set();
const activePvpBattles = new Map();
const activePveBattles = new Map();

function cleanDisplayName(name) {
    if (!name) return "لاعب";
    let clean = name.replace(/<a?:.+?:\d+>/g, '');
    clean = clean.replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\DFFF]|\uD83D[\uDC00-\DFFF]|[\u2011-\u26FF]|\uD83E[\uDD00-\DFFF]/g, '');
    return clean.trim();
}

function getUserRace(member, sql) {
    if (!member || !member.guild) return null;
    const allRaceRoles = sql.prepare("SELECT roleID, raceName FROM race_roles WHERE guildID = ?").all(member.guild.id);
    if (!member.roles || !member.roles.cache) return null;
    const userRoleIDs = member.roles.cache.map(r => r.id);
    return allRaceRoles.find(r => userRoleIDs.includes(r.roleID)) || null;
}

function getWeaponData(sql, member) {
    const userRace = getUserRace(member, sql);
    if (!userRace) return null;
    const weaponConfig = weaponsConfig.find(w => w.race === userRace.raceName);
    if (!weaponConfig) return null;
    let userWeapon = sql.prepare("SELECT * FROM user_weapons WHERE userID = ? AND guildID = ? AND raceName = ?").get(member.id, member.guild.id, userRace.raceName);
    if (!userWeapon || userWeapon.weaponLevel <= 0) return null;
    const damage = weaponConfig.base_damage + (weaponConfig.damage_increment * (userWeapon.weaponLevel - 1));
    return { ...weaponConfig, currentDamage: damage, currentLevel: userWeapon.weaponLevel };
}

function getAllSkillData(sql, member) {
    const userRace = getUserRace(member, sql);
    const skillsOutput = {};
    const userSkillsData = sql.prepare("SELECT * FROM user_skills WHERE userID = ? AND guildID = ?").all(member.id, member.guild.id);
    
    if (userSkillsData) {
        userSkillsData.forEach(userSkill => {
            const skillConfig = skillsConfig.find(s => s.id === userSkill.skillID);
            if (skillConfig && userSkill.skillLevel > 0) {
                const effectValue = skillConfig.base_value + (skillConfig.value_increment * (userSkill.skillLevel - 1));
                skillsOutput[skillConfig.id] = { ...skillConfig, currentLevel: userSkill.skillLevel, effectValue: effectValue };
            }
        });
    }

    if (userRace) {
        const raceSkillId = `race_${userRace.raceName.toLowerCase().replace(/\s+/g, '_')}_skill`;
        const raceSkillConfig = skillsConfig.find(s => s.id === raceSkillId);
        if (raceSkillConfig && !skillsOutput[raceSkillId]) {
            skillsOutput[raceSkillId] = { ...raceSkillConfig, currentLevel: 1, effectValue: raceSkillConfig.base_value };
        }
    }
    return skillsOutput;
}

async function getUserActiveSkill(sql, userId, guildId) {
    const userSkills = sql.prepare("SELECT * FROM user_skills WHERE userID = ? AND guildID = ?").all(userId, guildId);
    if (userSkills.length > 0) {
        const randomSkillData = userSkills[Math.floor(Math.random() * userSkills.length)];
        const skillConfig = skillsConfig.find(s => s.id === randomSkillData.skillID);
        if (skillConfig) {
            const level = randomSkillData.skillLevel;
            const power = skillConfig.base_value + (skillConfig.value_increment * (level - 1));
            return { name: skillConfig.name, level: level, damage: power };
        }
    }
    return null;
}

function buildHpBar(currentHp, maxHp) {
    currentHp = Math.max(0, currentHp);
    const percentage = (currentHp / maxHp) * 10;
    const filled = '█';
    const empty = '░';
    return `[${filled.repeat(Math.max(0, Math.floor(percentage))) + empty.repeat(Math.max(0, 10 - Math.floor(percentage)))}] ${currentHp}/${maxHp}`;
}

function buildEffectsString(effects) {
    let arr = [];
    if (effects.shield > 0) arr.push(`🛡️ (${effects.shield})`);
    if (effects.buff > 0) arr.push(`💪 (+${Math.round(effects.buff * 100)}%)`);
    if (effects.weaken > 0) arr.push(`📉 (-${Math.round(effects.weaken * 100)}%)`);
    if (effects.poison > 0) arr.push(`☠️ (${effects.poison})`);
    if (effects.burn > 0) arr.push(`🔥 (${effects.burn})`);
    if (effects.stun) arr.push(`⚡ (مشلول)`);
    if (effects.confusion) arr.push(`😵 (مرتبك)`);
    if (effects.rebound_active > 0) arr.push(`🔄 (${Math.round(effects.rebound_active * 100)}%)`);
    if (effects.evasion > 0) arr.push(`👻 (مراوغة)`);
    if (effects.blind > 0) arr.push(`🌫️ (أعمى)`);
    return arr.length > 0 ? arr.join(' | ') : 'لا يوجد';
}

function buildBattleEmbed(battleState, skillSelectionMode = false, skillPage = 0) {
    const [attackerId, defenderId] = battleState.turn;
    const attacker = battleState.players.get(attackerId);
    const defender = battleState.players.get(defenderId);
    const attackerName = attacker.isMonster ? attacker.name : cleanDisplayName(attacker.member.user.displayName);
    const defenderName = defender.isMonster ? defender.name : cleanDisplayName(defender.member.user.displayName);

    const embed = new EmbedBuilder().setTitle(`⚔️ ${attackerName} 🆚 ${defenderName} ⚔️`).setColor(Colors.Red);
    embed.addFields(
        { name: `${attackerName}`, value: `HP: ${buildHpBar(attacker.hp, attacker.maxHp)}\nتأثيرات: ${buildEffectsString(attacker.effects)}`, inline: true },
        { name: `${defenderName}`, value: `HP: ${buildHpBar(defender.hp, defender.maxHp)}\nتأثيرات: ${buildEffectsString(defender.effects)}`, inline: true }
    );

    if (battleState.isPvE) {
        embed.setDescription(`🦑 **معركة ضد وحش!**\nالدور الآن لـ: **${attackerName}**`);
    } else {
        embed.setDescription(`الرهان: **${(battleState.bet * 2).toLocaleString()}** ${EMOJI_MORA}\n\n**الدور الآن لـ:** ${attacker.member}`);
    }

    if (battleState.log.length > 0) embed.addFields({ name: "📝 السجل:", value: battleState.log.slice(-3).join('\n'), inline: false });

    if (attacker.isMonster) return { embeds: [embed], components: [] };

    if (skillSelectionMode) {
        const userSkills = attacker.skills || {};
        const availableSkills = Object.values(userSkills).filter(s => s.currentLevel > 0 || s.id.startsWith('race_'));
        const skillsPerPage = 4;
        const totalPages = Math.ceil(availableSkills.length / skillsPerPage);
        page = Math.max(0, Math.min(skillPage, totalPages - 1));
        battleState.skillPage = page;

        const skillsToShow = availableSkills.slice(page * skillsPerPage, (page * skillsPerPage) + skillsPerPage);
        const skillButtons = new ActionRowBuilder();
        
        const cooldowns = battleState.skillCooldowns[attackerId] || {};

        skillsToShow.forEach(skill => {
            let emoji = skill.emoji || '✨';
            const isOnCooldown = (cooldowns[skill.id] || 0) > 0;
            const label = isOnCooldown ? `${skill.name} (${cooldowns[skill.id]})` : skill.name;
            
            skillButtons.addComponents(new ButtonBuilder()
                .setCustomId(`pvp_skill_use_${skill.id}`)
                .setLabel(label)
                .setEmoji(emoji)
                .setStyle(isOnCooldown ? ButtonStyle.Secondary : ButtonStyle.Primary)
                .setDisabled(isOnCooldown)
            );
        });

        const navRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('pvp_skill_back').setLabel('العودة').setStyle(ButtonStyle.Danger));
        if (totalPages > 1) {
            navRow.addComponents(
                new ButtonBuilder().setCustomId(`pvp_skill_page_${page - 1}`).setLabel('◀️').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
                new ButtonBuilder().setCustomId(`pvp_skill_page_${page + 1}`).setLabel('▶️').setStyle(ButtonStyle.Secondary).setDisabled(page === totalPages - 1)
            );
        }
        return { embeds: [embed], components: [skillButtons, navRow] };
    }

    const mainButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('pvp_action_attack').setLabel('هـجـوم').setStyle(ButtonStyle.Danger).setEmoji('⚔️'),
        new ButtonBuilder().setCustomId('pvp_action_skill').setLabel('مـهــارات').setStyle(ButtonStyle.Primary).setEmoji('✨'),
        new ButtonBuilder().setCustomId('pvp_action_forfeit').setLabel('انسحاب').setStyle(ButtonStyle.Secondary).setEmoji('🏳️')
    );
    return { embeds: [embed], components: [mainButtons] };
}

function applySkillEffect(battleState, attackerId, skill) {
    const attacker = battleState.players.get(attackerId);
    const defenderId = battleState.turn.find(id => id !== attackerId);
    const defender = battleState.players.get(defenderId);

    const effectValue = skill.effectValue;
    const statType = skill.stat_type;

    let baseAtk = attacker.weapon ? attacker.weapon.currentDamage : 15;
    if (attacker.effects.buff > 0) baseAtk *= (1 + attacker.effects.buff);
    if (attacker.effects.weaken > 0) baseAtk *= (1 - attacker.effects.weaken);

    switch (statType) {
        case 'TrueDMG_Burn': {
            const burnDmg = Math.floor(baseAtk * 0.2);
            defender.effects.burn = burnDmg;
            defender.effects.burn_turns = 3;
            const dmg = Math.floor(baseAtk * 1.4); 
            defender.hp -= dmg;
            return `🐲 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** أحرق خصمه! (${dmg} ضرر + حرق)`;
        }
        case 'Cleanse_Buff_Shield': {
            attacker.effects.poison = 0;
            attacker.effects.burn = 0;
            attacker.effects.weaken = 0;
            attacker.effects.stun = false;
            attacker.effects.confusion = false;
            
            const shieldVal = Math.floor(attacker.maxHp * 0.25);
            attacker.effects.shield += shieldVal;
            attacker.effects.buff = 0.2;
            attacker.effects.buff_turns = 2;
            return `⚔️ **${attacker.isMonster ? attacker.name : attacker.member.displayName}** طهر نفسه واكتسب درعاً وقوة!`;
        }
        case 'Scale_MissingHP_Heal': {
            const missingHpPercent = (attacker.maxHp - attacker.hp) / attacker.maxHp;
            const extraDmg = Math.floor(baseAtk * missingHpPercent * 2);
            const dmg = Math.floor(baseAtk * 1.2) + extraDmg;
            defender.hp -= dmg;
            const healVal = Math.floor(attacker.maxHp * 0.15);
            attacker.hp = Math.min(attacker.maxHp, attacker.hp + healVal);
            return `⚖️ **${attacker.isMonster ? attacker.name : attacker.member.displayName}** عاقب خصمه بضرر متصاعد (${dmg}) وشفى نفسه!`;
        }
        case 'Sacrifice_Crit': {
            const selfDmg = Math.floor(attacker.maxHp * 0.10);
            attacker.hp -= selfDmg;
            const dmg = Math.floor(baseAtk * 2.5);
            defender.hp -= dmg;
            return `👹 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** ضحى بدمه لتوجيه ضربة مدمرة (${dmg})!`;
        }
        case 'Stun_Vulnerable': {
            const dmg = Math.floor(baseAtk * 1.1);
            defender.hp -= dmg;
            defender.effects.stun = true;
            defender.effects.stun_turns = 1;
            defender.effects.weaken = 0.5;
            defender.effects.weaken_turns = 2;
            return `🍃 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** شل حركة الخصم وجعله هشاً!`;
        }
        case 'Confusion': {
            const dmg = Math.floor(baseAtk * 1.2);
            defender.hp -= dmg;
            defender.effects.confusion = true;
            defender.effects.confusion_turns = 2;
            return `😵 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** أربك خصمه بلعنة الجنون!`;
        }
        case 'Lifesteal_Overheal': {
            const dmg = Math.floor(baseAtk * 1.3);
            defender.hp -= dmg;
            const healVal = Math.floor(dmg * 0.5);
            const missingHp = attacker.maxHp - attacker.hp;
            if (healVal > missingHp) {
                attacker.hp = attacker.maxHp;
                attacker.effects.shield += Math.floor((healVal - missingHp) * 0.5);
                return `🍷 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** امتص حياة خصمه وحول الفائض لدرع!`;
            }
            attacker.hp += healVal;
            return `🍷 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** امتص ${healVal} HP من خصمه!`;
        }
        case 'Chaos_RNG': {
            const dmg = Math.floor(baseAtk * 1.2);
            defender.hp -= dmg;
            const randomEffect = Math.random();
            let effectMsg = "";
            if (randomEffect < 0.25) {
                defender.effects.burn = Math.floor(baseAtk * 0.2); defender.effects.burn_turns = 3; effectMsg = "حرق";
            } else if (randomEffect < 0.50) {
                defender.effects.weaken = 0.3; defender.effects.weaken_turns = 2; effectMsg = "إضعاف";
            } else if (randomEffect < 0.75) {
                defender.effects.confusion = true; defender.effects.confusion_turns = 2; effectMsg = "ارتباك";
            } else {
                defender.effects.poison = Math.floor(baseAtk * 0.15); defender.effects.poison_turns = 3; effectMsg = "سم";
            }
            return `🌀 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** سبب فوضى (${effectMsg})!`;
        }
        case 'Dmg_Evasion': {
            const dmg = Math.floor(baseAtk * 1.3);
            defender.hp -= dmg;
            attacker.effects.evasion = 1;
            attacker.effects.evasion_turns = 1;
            return `👻 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** ضرب واختفى (مراوغة تامة)!`;
        }
        case 'Reflect_Tank': {
            attacker.effects.shield += Math.floor(attacker.maxHp * 0.2);
            attacker.effects.rebound_active = 0.4;
            attacker.effects.rebound_turns = 2;
            return `🔨 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** تحصن بالجبل (دفاع وعكس ضرر)!`;
        }
        case 'Execute_Heal': {
            const dmg = Math.floor(baseAtk * 1.8);
            if (defender.hp - dmg <= 0) {
                defender.hp = 0;
                attacker.hp = Math.min(attacker.maxHp, attacker.hp + Math.floor(attacker.maxHp * 0.25));
                return `🥩 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** افترس خصمه واستعاد صحته!`;
            }
            defender.hp -= dmg;
            return `🧟 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** نهش خصمه بضرر وحشي!`;
        }
        default:
            switch (skill.id) {
                case 'skill_shielding': 
                    attacker.effects.shield += Math.floor(attacker.maxHp * (effectValue / 100));
                    return `🛡️ **${attacker.isMonster ? attacker.name : attacker.member.displayName}** اكتسب درعاً!`;
                case 'skill_buffing':
                    attacker.effects.buff = effectValue / 100;
                    attacker.effects.buff_turns = 3;
                    return `💪 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** رفع قوته!`;
                case 'skill_rebound':
                    attacker.effects.rebound_active = effectValue / 100;
                    attacker.effects.rebound_turns = 3;
                    return `🔄 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** جهز الانعكاس!`;
                case 'skill_healing':
                    const heal = Math.floor(attacker.maxHp * (effectValue / 100));
                    attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
                    return `💖 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** استعاد ${heal} HP!`;
                case 'skill_poison':
                    defender.effects.poison = Math.floor(baseAtk * (effectValue / 100));
                    defender.effects.poison_turns = 3;
                    return `☠️ **${attacker.isMonster ? attacker.name : attacker.member.displayName}** سمم خصمه!`;
                case 'skill_weaken':
                    defender.effects.weaken = effectValue / 100;
                    defender.effects.weaken_turns = 3;
                    return `📉 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** أضعف خصمه!`;
                case 'skill_dispel':
                    defender.effects = { shield: 0, buff: 0, weaken: 0, poison: 0, rebound_active: 0, penetrate: 0, burn: 0, stun: false, confusion: false, evasion: 0, blind: 0 };
                    return `💨 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** بدد كل سحر الخصم!`;
                case 'skill_cleanse':
                    attacker.effects = { shield: attacker.effects.shield, buff: attacker.effects.buff, weaken: 0, poison: 0, rebound_active: attacker.effects.rebound_active, penetrate: 0, burn: 0, stun: false, confusion: false, evasion: 0, blind: 0 };
                    return `✨ **${attacker.isMonster ? attacker.name : attacker.member.displayName}** طهر نفسه من اللعنات!`;
                default:
                    const d = calculateDamage(attacker, defender, skill.stat_type === '%' ? 1.5 : 1);
                    defender.hp -= d;
                    return `💥 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** استخدم ${skill.name} وسبب ${d} ضرر!`;
            }
    }
}

function calculateDamage(attacker, defender, multiplier = 1) {
    let baseDmg = attacker.weapon ? attacker.weapon.currentDamage : 15;
    
    if (attacker.effects.buff > 0) baseDmg *= (1 + attacker.effects.buff);
    if (attacker.effects.weaken > 0) baseDmg *= (1 - attacker.effects.weaken);

    let finalDmg = Math.floor(baseDmg * multiplier);

    if (defender.effects.evasion > 0) {
        return 0;
    }

    if (defender.effects.shield > 0) {
        if (defender.effects.shield >= finalDmg) {
            defender.effects.shield -= finalDmg;
            finalDmg = 0;
        } else {
            finalDmg -= defender.effects.shield;
            defender.effects.shield = 0;
        }
    }

    if (defender.effects.rebound_active > 0) {
        const reflectedDmg = Math.floor(finalDmg * defender.effects.rebound_active);
        attacker.hp -= reflectedDmg;
        finalDmg -= reflectedDmg;
    }

    return Math.max(0, finalDmg);
}

async function startPvpBattle(i, client, sql, challengerMember, opponentMember, bet) {
    const getLevel = i.client.getLevel;
    const setLevel = i.client.setLevel;
    let challengerData = getLevel.get(challengerMember.id, i.guild.id) || { ...client.defaultData, user: challengerMember.id, guild: i.guild.id };
    let opponentData = getLevel.get(opponentMember.id, i.guild.id) || { ...client.defaultData, user: opponentMember.id, guild: i.guild.id };
    
    challengerData.mora -= bet; opponentData.mora -= bet;
    setLevel.run(challengerData); setLevel.run(opponentData);
    
    const cMaxHp = BASE_HP + (challengerData.level * HP_PER_LEVEL);
    const oMaxHp = BASE_HP + (opponentData.level * HP_PER_LEVEL);
    
    const defEffects = () => ({ shield: 0, buff: 0, buff_turns: 0, weaken: 0, weaken_turns: 0, poison: 0, poison_turns: 0, burn: 0, burn_turns: 0, rebound_active: 0, rebound_turns: 0, stun: false, stun_turns: 0, confusion: false, confusion_turns: 0, evasion: 0, evasion_turns: 0, blind: 0, blind_turns: 0 });

    const battleState = {
        isPvE: false, message: null, bet: bet, totalPot: bet * 2, turn: [opponentMember.id, challengerMember.id],
        log: [`🔥 بدأ القتال!`], skillPage: 0, processingTurn: false,
        skillCooldowns: { [challengerMember.id]: {}, [opponentMember.id]: {} },
        players: new Map([
            [challengerMember.id, { member: challengerMember, hp: cMaxHp, maxHp: cMaxHp, weapon: getWeaponData(sql, challengerMember), skills: getAllSkillData(sql, challengerMember), effects: defEffects() }],
            [opponentMember.id, { member: opponentMember, hp: oMaxHp, maxHp: oMaxHp, weapon: getWeaponData(sql, opponentMember), skills: getAllSkillData(sql, opponentMember), effects: defEffects() }]
        ])
    };
    activePvpBattles.set(i.channel.id, battleState);
    const { embeds, components } = buildBattleEmbed(battleState);
    battleState.message = await i.channel.send({ content: `${challengerMember} 🆚 ${opponentMember}`, embeds, components });
}

async function startPveBattle(interaction, client, sql, playerMember, monsterData, playerWeaponOverride) {
    const getLevel = client.getLevel;
    let playerData = getLevel.get(playerMember.id, interaction.guild.id) || { ...client.defaultData, user: playerMember.id, guild: interaction.guild.id };

    const pMaxHp = BASE_HP + (playerData.level * HP_PER_LEVEL);
    let finalPlayerWeapon = getWeaponData(sql, playerMember);
    if (!finalPlayerWeapon || finalPlayerWeapon.currentLevel === 0) {
        finalPlayerWeapon = playerWeaponOverride || { name: "سكين صيد", currentDamage: 15 };
    }

    const mMaxHp = Math.floor(pMaxHp * 0.8);
    const mDamage = Math.floor(finalPlayerWeapon.currentDamage * 0.9);
    
    const defEffects = () => ({ shield: 0, buff: 0, buff_turns: 0, weaken: 0, weaken_turns: 0, poison: 0, poison_turns: 0, burn: 0, burn_turns: 0, rebound_active: 0, rebound_turns: 0, stun: false, stun_turns: 0, confusion: false, confusion_turns: 0, evasion: 0, evasion_turns: 0, blind: 0, blind_turns: 0 });

    const battleState = {
        isPvE: true, monsterData: monsterData, message: null, turn: [playerMember.id, "monster"],
        log: [`🦑 **${monsterData.name}** ظهر من الأعماق!`], skillPage: 0, processingTurn: false,
        skillCooldowns: { [playerMember.id]: {}, "monster": {} },
        players: new Map([
            [playerMember.id, { isMonster: false, member: playerMember, hp: pMaxHp, maxHp: pMaxHp, weapon: finalPlayerWeapon, skills: getAllSkillData(sql, playerMember), effects: defEffects() }],
            ["monster", { isMonster: true, name: monsterData.name, hp: mMaxHp, maxHp: mMaxHp, weapon: { currentDamage: mDamage }, skills: {}, effects: defEffects() }]
        ])
    };

    activePveBattles.set(interaction.channel.id, battleState);
    const { embeds, components } = buildBattleEmbed(battleState);
    try { await interaction.editReply({ content: `🦑 **ظهر ${monsterData.name}!**`, embeds: [], components: [] }); } catch (e) {}
    battleState.message = await interaction.channel.send({ content: `⚔️ **قتال ضد وحش!** ${playerMember}`, embeds, components });
}

async function endBattle(battleState, winnerId, sql, reason = "win", buffCalculator = null) {
    if (!battleState.message) return;

    // 🔥🔥 تحديث الرسالة لآخر مرة قبل إعلان النتيجة (لإظهار الـ 0 HP) 🔥🔥
    const { embeds: finalEmbeds } = buildBattleEmbed(battleState, false);
    await battleState.message.edit({ embeds: finalEmbeds, components: [] }).catch(() => {});

    const channelId = battleState.message.channel.id;
    activePvpBattles.delete(channelId);
    activePveBattles.delete(channelId);

    const winner = battleState.players.get(winnerId);
    const loserId = Array.from(battleState.players.keys()).find(id => id !== winnerId);
    const loser = battleState.players.get(loserId);

    const embed = new EmbedBuilder();
    const BUFF_DURATION_MS = 15 * 60 * 1000;
    const expireTime = Date.now() + BUFF_DURATION_MS;

    if (battleState.isPvE) {
        if (winnerId !== "monster") {
            const monster = battleState.monsterData;
            const rewardMora = Math.floor(Math.random() * (monster.max_reward - monster.min_reward + 1)) + monster.min_reward;
            const rewardXP = Math.floor(Math.random() * (300 - 50 + 1)) + 50;

            const client = battleState.message.client;
            let userData = client.getLevel.get(winner.member.id, battleState.message.guild.id);
            userData.mora += rewardMora;
            userData.xp += rewardXP;
            client.setLevel.run(userData);

            sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(battleState.message.guild.id, winner.member.id, 15, expireTime, 'xp', 0.15);
            sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(battleState.message.guild.id, winner.member.id, 15, expireTime, 'mora', 0.15);

            const randomWinImage = WIN_IMAGES[Math.floor(Math.random() * WIN_IMAGES.length)];
            embed.setColor(Colors.Gold).setThumbnail(winner.member.displayAvatarURL()).setImage(randomWinImage)
                .setTitle(`🏆 قهرت ${monster.name}!`)
                .setDescription(`💰 **الغنيمة:** ${rewardMora} ${EMOJI_MORA}\n✨ **خبرة:** ${rewardXP} XP\n✦ حصلت على تعزيز +15% لمدة 15د`);
        } else {
            sql.prepare(`INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)`).run(battleState.message.guild.id, loser.member.id, -15, expireTime, 'mora', -0.15);
            const randomLoseImage = LOSE_IMAGES[Math.floor(Math.random() * LOSE_IMAGES.length)];
            embed.setColor(Colors.DarkRed).setImage(randomLoseImage)
                .setTitle(`💀 هزمك ${battleState.monsterData.name}...`)
                .setDescription(`✦ حصلت على إضعاف -15% مورا واكس بي لمدة 15د`);
        }
    } else {
        const getScore = battleState.message.client.getLevel;
        const setScore = battleState.message.client.setLevel;
        const finalWinnings = battleState.totalPot;

        let winnerData = getScore.get(winnerId, battleState.message.guild.id);
        winnerData.mora += finalWinnings;
        setScore.run(winnerData);

        // استخدام buffCalculator إذا تم توفيره (لحساب MoraBuff بناءً على الستريك مثلاً)
        if (buffCalculator) {
             // يمكنك استدعاء buffCalculator هنا إذا لزم الأمر، لكننا حالياً نستخدم قيم ثابتة للـ PvP
        }

        sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(battleState.message.guild.id, winnerId, 15, expireTime, 'mora', 0.15);
        sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(battleState.message.guild.id, winnerId, 15, expireTime, 'mora', 0.15);

        const loserExpiresAt = Date.now() + (15 * 60 * 1000);
        sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(battleState.message.guild.id, loserId, -15, loserExpiresAt, 'mora', -0.15);
        sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(battleState.message.guild.id, loserId, 0, loserExpiresAt, 'pvp_wounded', 0);

        const randomWinImage = WIN_IMAGES[Math.floor(Math.random() * WIN_IMAGES.length)];
        embed.setColor(Colors.Gold).setThumbnail(winner.member.displayAvatarURL()).setImage(randomWinImage)
            .setTitle(`🏆 الفائز هو ${cleanDisplayName(winner.member.user.displayName)}!`)
            .setDescription(`💰 **الرهان:** ${finalWinnings.toLocaleString()} ${EMOJI_MORA}\n\n👑 **الفائز:** ${winner.member} (+15% Buff)\n💀 **الخاسر:** ${loser.member} (-15% Nerf)`);
    }

    await battleState.message.channel.send({ embeds: [embed] });
}

function applyPersistentEffects(battleState, attackerId) {
    const attacker = battleState.players.get(attackerId);
    let logEntries = [];
    let skipTurn = false;

    // 1. تقليل عدادات الأدوار
    const effectsList = ['buff', 'weaken', 'rebound_active', 'stun', 'confusion', 'evasion', 'blind'];
    effectsList.forEach(eff => {
        if (attacker.effects[eff + '_turns'] > 0) {
            attacker.effects[eff + '_turns']--;
            if (attacker.effects[eff + '_turns'] <= 0) {
                if (typeof attacker.effects[eff] === 'boolean') attacker.effects[eff] = false;
                else attacker.effects[eff] = 0;
            }
        }
    });

    // 2. تطبيق أضرار التأثيرات المستمرة
    if (attacker.effects.poison > 0) {
        attacker.hp -= attacker.effects.poison;
        logEntries.push(`☠️ ${attacker.isMonster ? attacker.name : cleanDisplayName(attacker.member.user.displayName)} يتألم من السم (-${attacker.effects.poison})!`);
        attacker.effects.poison_turns--;
        if (attacker.effects.poison_turns <= 0) attacker.effects.poison = 0;
    }

    if (attacker.effects.burn > 0) {
        attacker.hp -= attacker.effects.burn;
        logEntries.push(`🔥 ${attacker.isMonster ? attacker.name : cleanDisplayName(attacker.member.user.displayName)} يحترق (-${attacker.effects.burn})!`);
        attacker.effects.burn_turns--;
        if (attacker.effects.burn_turns <= 0) attacker.effects.burn = 0;
    }

    // 3. التحقق من الشلل
    if (attacker.effects.stun) {
        logEntries.push(`⚡ ${attacker.isMonster ? attacker.name : cleanDisplayName(attacker.member.user.displayName)} مشلول ولا يستطيع الحركة!`);
        skipTurn = true;
    }

    return { logEntries, skipTurn };
}

module.exports = {
    activePvpChallenges, activePvpBattles, activePveBattles,
    BASE_HP, HP_PER_LEVEL, SKILL_COOLDOWN_TURNS,
    cleanDisplayName, getUserRace, getWeaponData, getAllSkillData, getUserActiveSkill,
    buildBattleEmbed, startPvpBattle, startPveBattle, endBattle, applyPersistentEffects,
    applySkillEffect, calculateDamage
};
