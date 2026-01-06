const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors } = require("discord.js");
const path = require('path');

const rootDir = process.cwd();
const weaponsConfig = require(path.join(rootDir, 'json', 'weapons-config.json'));
const skillsConfig = require(path.join(rootDir, 'json', 'skills-config.json'));

// ✅ استيراد محركات القتال الجديدة
const skillCalculator = require('./combat/skill-calculator');
const weaponCalculator = require('./combat/weapon-calculator');

const { OWNER_ID } = require('../dungeon/constants'); // تأكد من مسار الثوابت

// --- صور الفوز والخسارة ---
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

const EMOJI_MORA = '<:mora:1435647151349698621>';

const BASE_HP = 800;      
const HP_PER_LEVEL = 60;  
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
    // نستخدم الآلة الحاسبة للحصول على الضرر الخام إذا أردنا، أو نحسبه هنا للعرض فقط
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

// ✅ تم التحديث لإظهار العمى والنزيف
function buildEffectsString(effects) {
    let arr = [];
    if (effects.shield > 0) arr.push(`🛡️ (${effects.shield})`);
    if (effects.buff > 0) arr.push(`💪 (+${Math.round(effects.buff * 100)}%)`);
    if (effects.weaken > 0) arr.push(`📉 (-${Math.round(effects.weaken * 100)}%)`);
    if (effects.poison > 0) arr.push(`🩸/☠️ (${effects.poison})`); // نزيف أو سم
    if (effects.burn > 0) arr.push(`🔥 (${effects.burn})`);
    if (effects.stun) arr.push(`⚡ (مشلول)`);
    if (effects.confusion) arr.push(`😵 (مرتبك)`);
    if (effects.rebound_active > 0) arr.push(`🔄 (عكس)`);
    if (effects.evasion > 0) arr.push(`👻 (مراوغة)`);
    if (effects.blind > 0) arr.push(`🌫️ (أعمى)`); // ✅ جديد
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
                new ButtonBuilder().setCustomId(`pvp_skill_page_${page - 1}`).setLabel('▶️').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
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

// ✅ دالة تنفيذ المهارة الجديدة (تستخدم skill-calculator.js)
function applySkillEffect(battleState, attackerId, skill) {
    const cooldownDuration = skill.id.startsWith('race_') ? 5 : 3;
    
    // منع تفعيل كولداون مهارة الدرع عند الاستخدام (يتم تفعيله عند الانكسار)
    if (skill.id !== 'skill_shielding') {
        if (!battleState.skillCooldowns[attackerId]) battleState.skillCooldowns[attackerId] = {};
        battleState.skillCooldowns[attackerId][skill.id] = cooldownDuration;
    }

    const attacker = battleState.players.get(attackerId);
    const defenderId = battleState.turn.find(id => id !== attackerId);
    const defender = battleState.players.get(defenderId);

    // التحقق من هوية الأونر (إذا أردت تفعيل مضاعف الأونر)
    const isOwner = attacker.member ? attacker.member.id === OWNER_ID : false;

    // 🔥 استدعاء المحرك الجديد للمهارات
    const result = skillCalculator.executeSkill(attacker, defender, skill, isOwner);

    // تطبيق التغييرات على المدافع والمهاجم بناءً على النتيجة
    if (result.damage > 0) defender.hp -= result.damage;
    if (result.heal > 0) attacker.hp = Math.min(attacker.maxHp, attacker.hp + result.heal);
    if (result.selfDamage > 0) attacker.hp -= result.selfDamage;
    if (result.shield > 0) attacker.effects.shield += result.shield;

    // تطبيق التأثيرات على الخصم
    result.effectsApplied.forEach(eff => {
        if (eff.type === 'stun') { 
            defender.effects.stun = true; 
            defender.effects.stun_turns = eff.turns; 
        } else if (eff.type === 'confusion') { 
            defender.effects.confusion = true; 
            defender.effects.confusion_turns = eff.turns; 
        } else if (eff.type === 'blind') { // ✅ تفعيل العمى
            defender.effects.blind = eff.val; 
            defender.effects.blind_turns = eff.turns; 
        } else if (eff.type === 'dispel') {
            // تصفية جميع البفات
            defender.effects.shield = 0; defender.effects.buff = 0; defender.effects.buff_turns = 0;
            defender.effects.rebound_active = 0; defender.effects.rebound_turns = 0;
            defender.effects.evasion = 0; defender.effects.evasion_turns = 0;
        } else {
            // التأثيرات الرقمية (حرق، سم، إضعاف)
            defender.effects[eff.type] = eff.val;
            defender.effects[eff.type + '_turns'] = eff.turns;
        }
    });

    // تطبيق التأثيرات على النفس (Buffs/Cleanse)
    result.selfEffects.forEach(eff => {
        if (eff.type === 'cleanse') {
            attacker.effects.poison = 0; attacker.effects.poison_turns = 0;
            attacker.effects.burn = 0; attacker.effects.burn_turns = 0;
            attacker.effects.weaken = 0; attacker.effects.weaken_turns = 0;
            attacker.effects.stun = false; attacker.effects.stun_turns = 0;
            attacker.effects.confusion = false; attacker.effects.confusion_turns = 0;
            attacker.effects.blind = 0; attacker.effects.blind_turns = 0;
        } else if (eff.type === 'evasion') {
            attacker.effects.evasion = eff.val;
            attacker.effects.evasion_turns = eff.turns;
        } else {
            attacker.effects[eff.type] = eff.val;
            attacker.effects[eff.type + '_turns'] = eff.turns;
        }
    });

    // إدارة كولداون الدرع الخاص (إذا كان المدافع يملك درعاً وانكسر)
    // (هذا المنطق يمكن نقله للمحرك، لكن لابأس بإبقائه هنا للمراقبة)
    /* ملاحظة: المحرك الجديد يحسب الضرر والدرع بدقة، 
       لكن تتبع "هل انكسر الدرع الآن؟" أسهل هنا إذا أردنا تفعيل الكولداون للمدافع
    */

    return result.log;
}

// ✅ دالة الهجوم العادي الجديدة (تستخدم weapon-calculator.js)
// يتم استدعاؤها عند ضغط زر "هجوم"
function executeWeaponAttackAction(battleState, attackerId) {
    const attacker = battleState.players.get(attackerId);
    const defenderId = battleState.turn.find(id => id !== attackerId);
    const defender = battleState.players.get(defenderId);
    const isOwner = attacker.member ? attacker.member.id === OWNER_ID : false;

    // استدعاء محرك الأسلحة
    const result = weaponCalculator.executeWeaponAttack(attacker, defender, isOwner);
    
    // النتيجة تم تطبيقها بالفعل داخل executeWeaponAttack على كائنات attacker/defender
    // نحن فقط نعيد السجل
    return result.log;
}

// دالة wrapper للحفاظ على التوافق إذا كان الكود القديم يستدعيها
function calculateDamage(attacker, defender, multiplier = 1) {
    // هذه الدالة لم تعد تستخدم للحساب المباشر داخل المهارات
    // بل تستخدم فقط للهجوم العادي عبر الزر، لذا نوجهها للمحرك الجديد
    const isOwner = attacker.member ? attacker.member.id === OWNER_ID : false;
    // بما أن المحرك يطبق الضرر، نحن نحتاج فقط للقيمة للعرض إذا لزم الأمر
    // لكن الأفضل استخدام executeWeaponAttackAction في كود الزر
    return 0; // لم يعد لها حاجة كحساب رقمي فقط
}

// =======================================================
// دوال بدء المعركة (تحديث defEffects ليشمل blind)
// =======================================================

async function startPvpBattle(i, client, sql, challengerMember, opponentMember, bet) {
    const getLevel = i.client.getLevel;
    const setLevel = i.client.setLevel;
    let challengerData = getLevel.get(challengerMember.id, i.guild.id) || { ...client.defaultData, user: challengerMember.id, guild: i.guild.id };
    let opponentData = getLevel.get(opponentMember.id, i.guild.id) || { ...client.defaultData, user: opponentMember.id, guild: i.guild.id };
    
    challengerData.mora -= bet; opponentData.mora -= bet;
    setLevel.run(challengerData); setLevel.run(opponentData);
    
    const cMaxHp = BASE_HP + (challengerData.level * HP_PER_LEVEL);
    const oMaxHp = BASE_HP + (opponentData.level * HP_PER_LEVEL);
    
    // ✅ إضافة blind للقائمة
    const defEffects = () => ({ 
        shield: 0, 
        buff: 0, buff_turns: 0, 
        weaken: 0, weaken_turns: 0, 
        poison: 0, poison_turns: 0, 
        burn: 0, burn_turns: 0, 
        rebound_active: 0, rebound_turns: 0, 
        stun: false, stun_turns: 0, 
        confusion: false, confusion_turns: 0, 
        evasion: 0, evasion_turns: 0, 
        blind: 0, blind_turns: 0 
    });

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
            sql.prepare(`INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)`).run(battleState.message.guild.id, loser.member.id, -15, expireTime, 'mora', -15);
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

        sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(battleState.message.guild.id, winnerId, 15, expireTime, 'mora', 0.15);
        sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(battleState.message.guild.id, winnerId, 15, expireTime, 'xp', 0.15);

        const loserExpiresAt = Date.now() + (15 * 60 * 1000);
        sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(battleState.message.guild.id, loserId, -15, loserExpiresAt, 'mora', -0.15);
        sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(battleState.message.guild.id, loserId, 0, loserExpiresAt, 'pvp_wounded', 0);

        const randomWinImage = WIN_IMAGES[Math.floor(Math.random() * WIN_IMAGES.length)];
        
        embed.setColor('Random')
            .setThumbnail(winner.member.displayAvatarURL())
            .setImage(randomWinImage)
            .setTitle(`★ الـفـائـز هـو ${cleanDisplayName(winner.member.user.displayName)}`)
            .setDescription(
                `✶ مبـلغ الرهـان: ${finalWinnings.toLocaleString()} ${EMOJI_MORA}\n\n` +
                `✶ الـفائـز: ${winner.member} حصل علـى تعزيـز 15% مورا واكس بي لـ 15د <a:buff:1438796257522094081>\n\n` +
                `✶ الـخـاسـر: ${loser.member} اصبح جريح وبطور الشفـاء اصابته لعـنة -15% مورا واكس بي لـ 15د <a:Nerf:1438795685280612423>`
            );
    }

    await battleState.message.channel.send({ embeds: [embed] });
}

function applyPersistentEffects(battleState, attackerId) {
    const attacker = battleState.players.get(attackerId);
    let logEntries = [];
    let skipTurn = false;

    // 🔥 حفظ حالة الدرع قبل التأثيرات المستمرة
    const hadShield = attacker.effects.shield > 0;

    // ✅ إضافة blind للقائمة
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

    // 🩸 معالجة السم / النزيف (للغول وغيره)
    if (attacker.effects.poison > 0) {
        let dmg = attacker.effects.poison;
        // الدرع يمتص النزيف أولاً
        if (attacker.effects.shield > 0) {
            if (attacker.effects.shield >= dmg) {
                attacker.effects.shield -= dmg;
                dmg = 0;
            } else {
                dmg -= attacker.effects.shield;
                attacker.effects.shield = 0;
            }
        }
        if (dmg > 0) {
            attacker.hp -= dmg;
            logEntries.push(`🩸 **${cleanDisplayName(attacker.member ? attacker.member.user.displayName : attacker.name)}** ينزف/يتسمم (-${dmg})!`);
        }
        attacker.effects.poison_turns--;
        if (attacker.effects.poison_turns <= 0) attacker.effects.poison = 0;
    }

    // 🔥 معالجة الحرق (للتنين)
    if (attacker.effects.burn > 0) {
        let dmg = attacker.effects.burn;
        if (attacker.effects.shield > 0) {
             if (attacker.effects.shield >= dmg) {
                attacker.effects.shield -= dmg;
                dmg = 0;
            } else {
                dmg -= attacker.effects.shield;
                attacker.effects.shield = 0;
            }
        }
        if (dmg > 0) {
            attacker.hp -= dmg;
            logEntries.push(`🔥 **${cleanDisplayName(attacker.member ? attacker.member.user.displayName : attacker.name)}** يحترق (-${dmg})!`);
        }
        attacker.effects.burn_turns--;
        if (attacker.effects.burn_turns <= 0) attacker.effects.burn = 0;
    }

    // 🔥 تفعيل كولداون الدرع إذا انكسر بسبب السموم أو الحرق
    if (hadShield && attacker.effects.shield <= 0) {
        if (!battleState.skillCooldowns[attackerId]) battleState.skillCooldowns[attackerId] = {};
        battleState.skillCooldowns[attackerId]['skill_shielding'] = 3;
    }

    if (attacker.effects.stun) {
        logEntries.push(`⚡ **${cleanDisplayName(attacker.member ? attacker.member.user.displayName : attacker.name)}** مشلول ولا يستطيع الحركة!`);
        skipTurn = true;
    }

    // الارتباك (يضرب نفسه بنسبة 25%)
    if (attacker.effects.confusion && !skipTurn) {
        if (Math.random() < 0.25) {
            const selfDmg = Math.floor(attacker.maxHp * 0.05);
            attacker.hp -= selfDmg;
            logEntries.push(`😵 **${cleanDisplayName(attacker.member ? attacker.member.user.displayName : attacker.name)}** ضرب نفسه بسبب الارتباك (-${selfDmg})!`);
            skipTurn = true;
        }
    }

    return { logEntries, skipTurn };
}

module.exports = {
    activePvpChallenges, activePvpBattles, activePveBattles,
    BASE_HP, HP_PER_LEVEL, SKILL_COOLDOWN_TURNS,
    cleanDisplayName, getUserRace, getWeaponData, getAllSkillData, getUserActiveSkill,
    buildBattleEmbed, startPvpBattle, startPveBattle, endBattle, applyPersistentEffects,
    applySkillEffect, calculateDamage, executeWeaponAttackAction
};
