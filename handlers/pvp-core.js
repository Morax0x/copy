const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors, ComponentType } = require("discord.js");
const path = require('path');

// تحديد المسار الرئيسي للمشروع لجلب ملفات JSON
const rootDir = process.cwd();
const weaponsConfig = require(path.join(rootDir, 'json', 'weapons-config.json'));
const skillsConfig = require(path.join(rootDir, 'json', 'skills-config.json'));

const EMOJI_MORA = '<:mora:1435647151349698621>';
const BASE_HP = 100;
const HP_PER_LEVEL = 4;
const SKILL_COOLDOWN_TURNS = 3;

// --- صور النتائج ---
const WIN_IMAGES = [
    'https://i.postimg.cc/JhMrnyLd/download-1.gif',
    'https://i.postimg.cc/FHgv29L0/download.gif',
    'https://i.postimg.cc/9MzjRZNy/haru-midoriya.gif',
    'https://i.postimg.cc/4ygk8q3G/tumblr-nmao11Zm-Bx1r3rdh2o2-500-gif-500-281.gif',
    'https://i.postimg.cc/pL6NNpdC/Epic7-Epic-Seven-GIF-Epic7-Epic-Seven-Tensura-Discover-Share-GIFs.gif',
    'https://i.postimg.cc/05dLktNF/download-5.gif',
    'https://i.postimg.cc/sXRVMwhZ/download-2.gif'
];

const LOSE_IMAGES = [
    'https://i.postimg.cc/xd8msjxk/escapar-a-toda-velocidad.gif',
    'https://i.postimg.cc/1zb8JGVC/download.gif',
    'https://i.postimg.cc/rmSwjvkV/download-1.gif',
    'https://i.postimg.cc/8PyPZRqt/download.jpg'
];

// القوائم لتخزين بيانات المعارك النشطة
const activePvpChallenges = new Set();
const activePvpBattles = new Map();
const activePveBattles = new Map();

// --- الدوال المساعدة ---

function cleanDisplayName(name) {
    if (!name) return "لاعب";
    let clean = name.replace(/<a?:.+?:\d+>/g, '');
    clean = clean.replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\DFFF]|\uD83D[\uDC00-\DFFF]|[\u2011-\u26FF]|\uD83E[\uDD00-\DFFF]/g, '');
    clean = clean.replace(/\s*[|・•»✦]\s*\d+\s* ?🔥/g, '');
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
                const skillLevel = userSkill.skillLevel;
                const effectValue = skillConfig.base_value + (skillConfig.value_increment * (skillLevel - 1));
                skillsOutput[skillConfig.id] = { ...skillConfig, currentLevel: skillLevel, effectValue: effectValue };
            }
        });
    }

    if (userRace) {
        const raceSkillId = `race_${userRace.raceName.toLowerCase().replace(/\s+/g, '_')}_skill`;
        const raceSkillConfig = skillsConfig.find(s => s.id === raceSkillId);

        if (raceSkillConfig) {
            if (!skillsOutput[raceSkillId]) {
                skillsOutput[raceSkillId] = { 
                    ...raceSkillConfig, 
                    currentLevel: 1, 
                    effectValue: raceSkillConfig.base_value 
                };
            }
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

// --- دوال المعركة الأساسية ---

function buildHpBar(currentHp, maxHp) {
    currentHp = Math.max(0, currentHp);
    const percentage = (currentHp / maxHp) * 10;
    const filled = '█';
    const empty = '░';
    return `[${filled.repeat(Math.max(0, Math.floor(percentage))) + empty.repeat(Math.max(0, 10 - Math.floor(percentage)))}] ${currentHp}/${maxHp}`;
}

function buildSkillButtons(battleState, attackerId, page = 0) {
    const attacker = battleState.players.get(attackerId);
    if (attacker.isMonster) return []; 

    const cooldowns = battleState.skillCooldowns[attackerId];
    const userSkills = attacker.skills || {};
    const availableSkills = Object.values(userSkills).filter(s => s.currentLevel > 0 || s.id.startsWith('race_'));

    const skillsPerPage = 4;
    const totalPages = Math.ceil(availableSkills.length / skillsPerPage);
    page = Math.max(0, Math.min(page, totalPages - 1));
    battleState.skillPage = page;

    const skillsToShow = availableSkills.slice(page * skillsPerPage, (page * skillsPerPage) + skillsPerPage);
    const skillButtons = new ActionRowBuilder();
    
    skillsToShow.forEach(skill => {
        let emoji = skill.emoji || '✨';
        if (!emoji.match(/<a?:.+?:\d+>/) && !emoji.match(/(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/)) {
             emoji = '✨';
        }

        skillButtons.addComponents(new ButtonBuilder()
            .setCustomId(`pvp_skill_use_${skill.id}`)
            .setLabel(`${skill.name}`)
            .setEmoji(emoji)
            .setStyle(ButtonStyle.Primary)
            .setDisabled((cooldowns[skill.id] || 0) > 0)
        );
    });

    const navigationButtons = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('pvp_skill_back').setLabel('العودة').setStyle(ButtonStyle.Secondary));
    if (totalPages > 1) {
        navigationButtons.addComponents(
            new ButtonBuilder().setCustomId(`pvp_skill_page_${page - 1}`).setLabel('◀️').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
            new ButtonBuilder().setCustomId(`pvp_skill_page_${page + 1}`).setLabel('▶️').setStyle(ButtonStyle.Secondary).setDisabled(page === totalPages - 1)
        );
    }
    return [skillButtons, navigationButtons].filter(row => row.components.length > 0);
}

function buildEffectsString(effects) {
    let arr = [];
    if (effects.shield > 0) arr.push(`🛡️ (${effects.shield})`);
    if (effects.buff > 0) arr.push(`💪 (${effects.buff})`);
    if (effects.weaken > 0) arr.push(`📉 (${effects.weaken})`);
    if (effects.poison > 0) arr.push(`☠️ (${effects.poison})`);
    if (effects.rebound_active > 0) arr.push(`🔄 (${effects.rebound_active})`);
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
        return { embeds: [embed], components: buildSkillButtons(battleState, attackerId, skillPage) };
    }

    const mainButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('pvp_action_attack').setLabel('هـجـوم').setStyle(ButtonStyle.Danger).setEmoji('⚔️'),
        new ButtonBuilder().setCustomId('pvp_action_skill').setLabel('مـهــارات').setStyle(ButtonStyle.Primary).setEmoji('✨'),
        new ButtonBuilder().setCustomId('pvp_action_forfeit').setLabel('انسحاب').setStyle(ButtonStyle.Secondary).setEmoji('🏳️')
    );
    return { embeds: [embed], components: [mainButtons] };
}

// 🔥 دالة تفعيل المهارات (تم إضافتها لتخزين التأثيرات) 🔥
function applySkillEffect(battleState, attackerId, skill) {
    const attacker = battleState.players.get(attackerId);
    // العثور على المدافع (الشخص الآخر)
    const defenderId = battleState.turn.find(id => id !== attackerId);
    const defender = battleState.players.get(defenderId);

    const effectValue = skill.effectValue; // القيمة المحسوبة بناءً على اللفل

    switch (skill.id) {
        case 'skill_shielding': 
        case 'race_human_skill': // مثال لمهارة درع العرق
            attacker.effects.shield = Math.floor(attacker.maxHp * (effectValue / 100));
            return `🛡️ **${attacker.isMonster ? attacker.name : attacker.member.displayName}** اكتسب درعاً بقوة ${attacker.effects.shield}!`;

        case 'skill_buffing':
            attacker.effects.buff = effectValue; // نسبة زيادة الهجوم
            return `💪 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** رفع قوته الهجومية!`;

        case 'skill_rebound':
            attacker.effects.rebound_active = effectValue; // نسبة عكس الضرر
            return `🔄 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** جهز درع الانعكاس!`;

        case 'skill_healing':
            const healAmount = Math.floor(attacker.maxHp * (effectValue / 100));
            attacker.hp = Math.min(attacker.maxHp, attacker.hp + healAmount);
            return `💖 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** استعاد ${healAmount} HP!`;

        case 'skill_poison':
            defender.effects.poison = effectValue; // قيمة ضرر السم لكل دور
            return `☠️ **${attacker.isMonster ? attacker.name : attacker.member.displayName}** سمم خصمه!`;

        case 'skill_weaken':
            defender.effects.weaken = effectValue; // نسبة تقليل الدفاع/الهجوم
            return `📉 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** أضعف خصمه!`;

        default:
            // مهارات هجومية مباشرة
            const dmg = calculateDamage(attacker, defender, skill.stat_type === '%' ? 1.5 : effectValue); // مثال: المهارات تضرب بقوة 150% أو قيمة ثابتة
            defender.hp -= dmg;
            return `💥 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** استخدم ${skill.name} وسبب ${dmg} ضرر!`;
    }
}

// 🔥 دالة حساب الضرر (تأخذ البوفات والدروع في الاعتبار) 🔥
function calculateDamage(attacker, defender, multiplier = 1) {
    let baseDmg = attacker.weapon ? attacker.weapon.currentDamage : 15; // الضرر الأساسي
    
    // تطبيق البوف (زيادة الهجوم)
    if (attacker.effects.buff > 0) {
        baseDmg *= (1 + (attacker.effects.buff / 100));
    }

    // تطبيق الضعف على المهاجم (إذا كان موجوداً)
    if (attacker.effects.weaken > 0) {
        baseDmg *= (1 - (attacker.effects.weaken / 100));
    }

    let finalDmg = Math.floor(baseDmg * multiplier);

    // تطبيق الدرع
    if (defender.effects.shield > 0) {
        if (defender.effects.shield >= finalDmg) {
            defender.effects.shield -= finalDmg;
            finalDmg = 0; // الدرع امتص الضربة بالكامل
        } else {
            finalDmg -= defender.effects.shield;
            defender.effects.shield = 0; // تحطم الدرع
        }
    }

    // تطبيق الانعكاس (Rebound)
    if (defender.effects.rebound_active > 0) {
        const reflectedDmg = Math.floor(finalDmg * (defender.effects.rebound_active / 100));
        attacker.hp -= reflectedDmg; // المهاجم يتلقى ضرراً
        finalDmg -= reflectedDmg; // تقليل الضرر الذي يتلقاه المدافع
    }

    return Math.max(0, finalDmg);
}


async function startPvpBattle(i, client, sql, challengerMember, opponentMember, bet) {
    const getLevel = i.client.getLevel;
    const setLevel = i.client.setLevel;
    let challengerData = getLevel.get(challengerMember.id, i.guild.id) || { ...client.defaultData, user: challengerMember.id, guild: i.guild.id };
    let opponentData = getLevel.get(opponentMember.id, i.guild.id) || { ...client.defaultData, user: opponentMember.id, guild: i.guild.id };
    
    // خصم الرهان
    challengerData.mora -= bet; opponentData.mora -= bet;
    setLevel.run(challengerData); setLevel.run(opponentData);
    
    const challengerMaxHp = BASE_HP + (challengerData.level * HP_PER_LEVEL);
    const opponentMaxHp = BASE_HP + (opponentData.level * HP_PER_LEVEL);
    
    const battleState = {
        isPvE: false, message: null, bet: bet, totalPot: bet * 2, turn: [opponentMember.id, challengerMember.id],
        log: [`🔥 بدأ القتال!`], skillPage: 0, processingTurn: false,
        skillCooldowns: { [challengerMember.id]: {}, [opponentMember.id]: {} },
        players: new Map([
            [challengerMember.id, { member: challengerMember, hp: challengerMaxHp, maxHp: challengerMaxHp, weapon: getWeaponData(sql, challengerMember), skills: getAllSkillData(sql, challengerMember), effects: { shield: 0, buff: 0, weaken: 0, poison: 0, rebound_active: 0, penetrate: 0 } }],
            [opponentMember.id, { member: opponentMember, hp: opponentMaxHp, maxHp: opponentMaxHp, weapon: getWeaponData(sql, opponentMember), skills: getAllSkillData(sql, opponentMember), effects: { shield: 0, buff: 0, weaken: 0, poison: 0, rebound_active: 0, penetrate: 0 } }]
        ])
    };
    activePvpBattles.set(i.channel.id, battleState);
    const { embeds, components } = buildBattleEmbed(battleState);
    battleState.message = await i.channel.send({ content: `${challengerMember} 🆚 ${opponentMember}`, embeds, components });
}

async function startPveBattle(interaction, client, sql, playerMember, monsterData, playerWeaponOverride) {
    const getLevel = client.getLevel;
    let playerData = getLevel.get(playerMember.id, interaction.guild.id) || { ...client.defaultData, user: playerMember.id, guild: interaction.guild.id };

    const playerMaxHp = BASE_HP + (playerData.level * HP_PER_LEVEL);
    let finalPlayerWeapon = getWeaponData(sql, playerMember);
    if (!finalPlayerWeapon || finalPlayerWeapon.currentLevel === 0) {
        finalPlayerWeapon = playerWeaponOverride || { name: "سكين صيد", currentDamage: 15 };
    }

    // ⚖️ موازنة القوة
    const monsterMaxHp = Math.floor(playerMaxHp * 0.8);
    const monsterDamage = Math.floor(finalPlayerWeapon.currentDamage * 0.9);

    const allSkillIds = skillsConfig.map(s => s.id);
    const initialCooldowns = allSkillIds.reduce((acc, id) => { acc[id] = 0; return acc; }, {});

    const battleState = {
        isPvE: true,
        monsterData: monsterData,
        message: null,
        turn: [playerMember.id, "monster"],
        log: [`🦑 **${monsterData.name}** ظهر من الأعماق!`],
        skillPage: 0,
        processingTurn: false,
        skillCooldowns: { [playerMember.id]: { ...initialCooldowns }, "monster": {} },
        players: new Map([
            [playerMember.id, { 
                isMonster: false, member: playerMember, hp: playerMaxHp, maxHp: playerMaxHp, weapon: finalPlayerWeapon, 
                skills: getAllSkillData(sql, playerMember), effects: { shield: 0, buff: 0, weaken: 0, poison: 0, rebound_active: 0, penetrate: 0 } 
            }],
            ["monster", { 
                isMonster: true, name: monsterData.name, hp: monsterMaxHp, maxHp: monsterMaxHp, 
                weapon: { currentDamage: monsterDamage }, 
                skills: {}, effects: { shield: 0, buff: 0, weaken: 0, poison: 0 } 
            }]
        ])
    };

    activePveBattles.set(interaction.channel.id, battleState);

    const { embeds, components } = buildBattleEmbed(battleState);
    
    try {
        await interaction.editReply({ 
            content: `🦑 **ظهر ${monsterData.name}!**\nانظر للأسفل لبدء القتال! 👇`,
            embeds: [], 
            components: [] 
        });
    } catch (e) {}

    const battleMessage = await interaction.channel.send({ 
        content: `⚔️ **قتال ضد وحش!** ${playerMember}`, 
        embeds, 
        components 
    });
    
    battleState.message = battleMessage;
}

// 🌟🌟 دالة النهاية 🌟🌟
async function endBattle(battleState, winnerId, sql, reason = "win") {
    if (!battleState.message) return;

    const channelId = battleState.message.channel.id;
    activePvpBattles.delete(channelId);
    activePveBattles.delete(channelId);

    const winner = battleState.players.get(winnerId);
    const loserId = Array.from(battleState.players.keys()).find(id => id !== winnerId);
    const loser = battleState.players.get(loserId);

    const embed = new EmbedBuilder();
    let descriptionLines = [];

    const BUFF_DURATION_MS = 15 * 60 * 1000; 
    const winnerExpiresAt = Date.now() + BUFF_DURATION_MS;

    // --- حالة PvE (الوحوش) ---
    if (battleState.isPvE) {
        if (winnerId !== "monster") {
            // فوز اللاعب على الوحش
            const monster = battleState.monsterData;
            const rewardMora = Math.floor(Math.random() * (monster.max_reward - monster.min_reward + 1)) + monster.min_reward;
            const rewardXP = Math.floor(Math.random() * (300 - 50 + 1)) + 50;

            const client = battleState.message.client;
            let userData = client.getLevel.get(winner.member.id, battleState.message.guild.id);
            userData.mora += rewardMora;
            userData.xp += rewardXP;
            client.setLevel.run(userData);

            sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(battleState.message.guild.id, winner.member.id, 15, winnerExpiresAt, 'xp', 0.15);
            sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(battleState.message.guild.id, winner.member.id, 15, winnerExpiresAt, 'mora', 0.15);

            const randomWinImage = WIN_IMAGES[Math.floor(Math.random() * WIN_IMAGES.length)];
            embed.setColor(Colors.Gold);
            embed.setThumbnail(winner.member.displayAvatarURL());
            embed.setImage(randomWinImage);

            descriptionLines.push(`🏆 **قهرت ${monster.name}!**`);
            descriptionLines.push(``);
            descriptionLines.push(`💰 **الغنيمة:** ${rewardMora.toLocaleString()} ${EMOJI_MORA}`);
            descriptionLines.push(`✨ **خبرة:** ${rewardXP} XP`);
            descriptionLines.push(`✦ حـصـلت على تعزيـز اكس بي ومورا: +15% \` 15 د \` <a:buff:1438796257522094081>`);

        } else {
            // خسارة اللاعب أمام الوحش
            const playerMember = loser.member;
            const expireTime = Date.now() + (15 * 60 * 1000);
            
            sql.prepare(`INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)`).run(battleState.message.guild.id, playerMember.id, -15, expireTime, 'mora', -0.15);
            sql.prepare(`INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)`).run(battleState.message.guild.id, playerMember.id, 0, expireTime, 'pvp_wounded', 0);

            const randomLoseImage = LOSE_IMAGES[Math.floor(Math.random() * LOSE_IMAGES.length)];
            embed.setColor(Colors.DarkRed);
            embed.setImage(randomLoseImage);

            descriptionLines.push(`💀 **هزمك ${battleState.monsterData.name}...**`);
            descriptionLines.push(``);
            descriptionLines.push(`✦ اصبـح جـريـح وبطـور الشفـاء \` 15 د \``);
            descriptionLines.push(`✦ حـصـل عـلى اضـعـاف اكس بي ومورا: -15% \` 15 د \` <a:Nerf:1438795685280612423>`);
        }
    } 
    // --- حالة PvP (لاعب ضد لاعب) ---
    else {
        const getScore = battleState.message.client.getLevel;
        const setScore = battleState.message.client.setLevel;
        
        const finalWinnings = battleState.totalPot;

        let winnerData = getScore.get(winnerId, battleState.message.guild.id);
        winnerData.mora += finalWinnings;
        setScore.run(winnerData);

        sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(battleState.message.guild.id, winnerId, 15, winnerExpiresAt, 'xp', 0.15);
        sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(battleState.message.guild.id, winnerId, 15, winnerExpiresAt, 'mora', 0.15);

        const loserExpiresAt = Date.now() + (15 * 60 * 1000);
        sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(battleState.message.guild.id, loserId, -15, loserExpiresAt, 'mora', -0.15);
        sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(battleState.message.guild.id, loserId, 0, loserExpiresAt, 'pvp_wounded', 0);

        const randomWinImage = WIN_IMAGES[Math.floor(Math.random() * WIN_IMAGES.length)];
        embed.setColor(Colors.Gold);
        embed.setThumbnail(winner.member.displayAvatarURL());
        embed.setImage(randomWinImage);

        embed.setTitle(`🏆 الفائز هو ${cleanDisplayName(winner.member.user.displayName)}!`);
        
        descriptionLines.push(`✶ الـفـائـز: ${winner.member}`);
        descriptionLines.push(`✦ مبـلغ الرهـان: **${finalWinnings.toLocaleString()}** ${EMOJI_MORA}`);
        descriptionLines.push(`✦ حـصـل على تعزيـز اكس بي ومورا: +15% \` 15 د \` <a:buff:1438796257522094081>`);
        descriptionLines.push(``);
        descriptionLines.push(`✶ الـخـاسـر: ${loser.member}`);
        descriptionLines.push(`✦ اصبـح جـريـح وبطـور الشفـاء \` 15 د \``);
        descriptionLines.push(`✦ حـصـل عـلى اضـعـاف اكس بي ومورا: -15% \` 15 د \` <a:Nerf:1438795685280612423>`);
    }

    embed.setDescription(descriptionLines.join('\n'));

    await battleState.message.channel.send({ embeds: [embed] });
    await battleState.message.edit({ components: [] }).catch(() => {});
}

function applyPersistentEffects(battleState, attackerId) {
    const attacker = battleState.players.get(attackerId);
    let logEntries = [];
    if (attacker.effects.poison > 0) {
        const poisonDamage = attacker.effects.poison; // استخدام القيمة المخزنة
        attacker.hp -= poisonDamage;
        logEntries.push(`☠️ ${attacker.isMonster ? attacker.name : cleanDisplayName(attacker.member.user.displayName)} يتألم من السم (-${poisonDamage})!`);
    }
    // يمكن إضافة تأثيرات أخرى هنا (مثل الشفاء المستمر)
    return logEntries;
}

module.exports = {
    activePvpChallenges, activePvpBattles, activePveBattles,
    BASE_HP, HP_PER_LEVEL, SKILL_COOLDOWN_TURNS,
    cleanDisplayName, getUserRace, getWeaponData, getAllSkillData, getUserActiveSkill,
    buildBattleEmbed, startPvpBattle, startPveBattle, endBattle, applyPersistentEffects,
    applySkillEffect, calculateDamage // تصدير الدوال الجديدة
};
