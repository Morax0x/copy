// handlers/knight-battle.js

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors, ComponentType } = require("discord.js");
const path = require('path');

// ==========================================
// ⚙️ إعدادات المسارات والملفات
// ==========================================
const rootDir = process.cwd();
const weaponsConfig = require(path.join(rootDir, 'json', 'weapons-config.json'));
const skillsConfig = require(path.join(rootDir, 'json', 'skills-config.json'));

// إعدادات الصحة والعملة
const BASE_HP = 800;        
const HP_PER_LEVEL = 60;    
const EMOJI_MORA = '<:mora:1435647151349698621>';

// صور الفارس
const KNIGHT_IMAGES = {
    MAIN: 'https://i.postimg.cc/d1ndBX7B/download.gif', 
    WIN: 'https://i.postimg.cc/8Cj8xfHC/e6128ac95afc6c9b5d374946f87c573c.jpg', 
    LOSE: 'https://i.postimg.cc/fb3F8nWQ/crusader-darkest-dungeon.gif'
};

// خريطة لتخزين المعارك النشطة
const activePveBattles = new Map();

// ==========================================
// 🛠️ دوال مساعدة
// ==========================================

function cleanDisplayName(name) {
    if (!name) return "لاعب";
    return name.replace(/<a?:.+?:\d+>/g, '').trim();
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
    if (effects.evasion > 0) arr.push(`👻 (مراوغة)`);
    if (effects.rebound_active > 0) arr.push(`🔄 (عكس)`);
    return arr.length > 0 ? arr.join(' | ') : 'لا يوجد';
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

function calculateDamage(attacker, defender, multiplier = 1) {
    let baseDmg = attacker.weapon ? attacker.weapon.currentDamage : 15;
     
    if (attacker.effects.buff > 0) baseDmg *= (1 + attacker.effects.buff);
    if (attacker.effects.weaken > 0) baseDmg *= (1 - attacker.effects.weaken);

    let finalDmg = Math.floor(baseDmg * multiplier);

    if (defender.effects.evasion > 0) return 0;

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

// 🔥 دالة جديدة: فحص انكسار الدرع وتفعيل الكولداون
function checkShieldBreak(battleState, defenderId) {
    const defender = battleState.players.get(defenderId);
     
    // إذا الدرع وصل 0 أو أقل، وكان هناك مصدر للدرع (يعني كان مفعل ولم يطبق الكولداون بعد)
    if (defender.effects.shield <= 0 && defender.effects.shield_source) {
        const skillId = defender.effects.shield_source;
        const cooldownDuration = defender.effects.shield_cd_duration || 4; 

        // تفعيل الكولداون الآن
        if (!battleState.skillCooldowns[defenderId]) battleState.skillCooldowns[defenderId] = {};
        battleState.skillCooldowns[defenderId][skillId] = cooldownDuration;

        // تنظيف بيانات الدرع
        defender.effects.shield_source = null;
        defender.effects.shield_cd_duration = 0;
        defender.effects.shield = 0; 

        return `💔 **انكسر درع ${defender.isMonster ? defender.name : cleanDisplayName(defender.member.user.displayName)}**! (بدأ الكولداون)`;
    }
    return null;
}

function applyPersistentEffects(battleState, attackerId) {
    const attacker = battleState.players.get(attackerId);
    let logEntries = [];
    let skipTurn = false;

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

    if (attacker.effects.stun) {
        logEntries.push(`⚡ ${attacker.isMonster ? attacker.name : cleanDisplayName(attacker.member.user.displayName)} مشلول ولا يستطيع الحركة!`);
        skipTurn = true;
    }

    return { logEntries, skipTurn };
}

function applySkillEffect(battleState, attackerId, skill) {
    const attacker = battleState.players.get(attackerId);
    const defenderId = Array.from(battleState.players.keys()).find(id => id !== attackerId);
    const defender = battleState.players.get(defenderId);

    // تحديد مدة الكولداون الافتراضية
    let cooldownDuration = 3; 
    if (skill.id === 'skill_healing') cooldownDuration = 6;
    else if (skill.id.startsWith('race_')) cooldownDuration = 5;

    // 🔥🔥 منطق الدروع الجديد 🔥🔥
    const shieldSkills = ['skill_shielding', 'Cleanse_Buff_Shield', 'Reflect_Tank', 'Lifesteal_Overheal'];
     
    // هل المهارة تعتبر مهارة درع؟ (تقريبي لمهارة الامتصاص)
    const isShieldSkill = shieldSkills.includes(skill.id) || (skill.id === 'Lifesteal_Overheal' && (attacker.maxHp - attacker.hp) < (attacker.weapon.currentDamage * 0.6));

    // ⛔ 1. منع وضع درع فوق درع
    if (isShieldSkill && attacker.effects.shield > 0) {
        return `🚫 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** حاول تفعيل درع لكن لديه درع نشط بالفعل!`;
    }

    // 2. تطبيق الكولداون
    if (!battleState.skillCooldowns[attackerId]) battleState.skillCooldowns[attackerId] = {};
     
    if (isShieldSkill) {
        // إذا كانت درعاً، نحفظ الكولداون ولا نفعله الآن
        attacker.effects.shield_source = skill.id;
        attacker.effects.shield_cd_duration = cooldownDuration;
    } else {
        // المهارات العادية تأخذ كولداون فوراً
        battleState.skillCooldowns[attackerId][skill.id] = cooldownDuration;
    }

    const effectValue = skill.effectValue;
    const statType = skill.stat_type;

    let baseAtk = attacker.weapon ? attacker.weapon.currentDamage : 15;
    if (attacker.effects.buff > 0) baseAtk *= (1 + attacker.effects.buff);
    if (attacker.effects.weaken > 0) baseAtk *= (1 - attacker.effects.weaken);

    switch (statType) {
        case 'Spirit_RNG': {
            const spiritDmg = Math.floor(baseAtk * 1.3);
            defender.hp -= spiritDmg;
            const roll = Math.random() * 100; 
            let effectMsg = "";
            if (roll < 2) { 
                defender.effects.stun = true; defender.effects.stun_turns = 1; effectMsg = "😱 **لعنة الرعب!** (شلل)";
            } else if (roll < 7) { 
                attacker.effects.rebound_active = 1.0; attacker.effects.rebound_turns = 2; effectMsg = "👻 **تلبس!** (عكس الضرر القادم)";
            } else if (roll < 57) { 
                attacker.effects.buff = (attacker.effects.buff || 0) + 0.15; attacker.effects.buff_turns = 3;
                defender.effects.weaken = (defender.effects.weaken || 0) + 0.15; defender.effects.weaken_turns = 3;
                effectMsg = "💀 **سرقة الروح!** (امتصاص القوة)";
            } else { effectMsg = "(هجوم طيفي)"; }
            return `👻 **${cleanDisplayName(attacker.member.user.displayName)}** أطلق طيفاً! سبب **${spiritDmg}** ضرر + ${effectMsg}`;
        }
        case 'TrueDMG_Burn': {
            const burnDmg = Math.floor(baseAtk * 0.2);
            defender.effects.burn = burnDmg; defender.effects.burn_turns = 3;
            const dmg = Math.floor(baseAtk * 1.4); defender.hp -= dmg;
            return `🐲 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** أحرق خصمه! (${dmg} ضرر + حرق)`;
        }
        case 'Cleanse_Buff_Shield': {
            attacker.effects.poison = 0; attacker.effects.poison_turns = 0;
            attacker.effects.burn = 0; attacker.effects.burn_turns = 0;
            attacker.effects.weaken = 0; attacker.effects.weaken_turns = 0;
            attacker.effects.stun = false; attacker.effects.stun_turns = 0;
            attacker.effects.confusion = false; attacker.effects.confusion_turns = 0;
            attacker.effects.blind = 0; attacker.effects.blind_turns = 0;
            const shieldVal = Math.floor(attacker.maxHp * 0.25);
            attacker.effects.shield += shieldVal;
            attacker.effects.buff = 0.2; attacker.effects.buff_turns = 2;
             
            // تسجيل المصدر
            attacker.effects.shield_source = skill.id; 
            attacker.effects.shield_cd_duration = cooldownDuration;

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
            const dmg = Math.floor(baseAtk * 2.0);
            defender.hp -= dmg;
            return `👹 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** ضحى بدمه لتوجيه ضربة مدمرة (${dmg})!`;
        }
        case 'Stun_Vulnerable': {
            const dmg = Math.floor(baseAtk * 1.1);
            defender.hp -= dmg;
            defender.effects.stun = true; defender.effects.stun_turns = 1;
            defender.effects.weaken = 0.5; defender.effects.weaken_turns = 2;
            return `🍃 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** شل حركة الخصم وجعله هشاً!`;
        }
        case 'Confusion': {
            const dmg = Math.floor(baseAtk * 1.2);
            defender.hp -= dmg;
            defender.effects.confusion = true; defender.effects.confusion_turns = 2;
            return `😵 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** أربك خصمه بلعنة الجنون!`;
        }
        case 'Lifesteal_Overheal': {
            const dmg = Math.floor(baseAtk * 1.3);
            defender.hp -= dmg;
            const healVal = Math.floor(dmg * 0.5);
            const missingHp = attacker.maxHp - attacker.hp;
            if (healVal > missingHp) {
                attacker.hp = attacker.maxHp;
                const shieldAdd = Math.floor((healVal - missingHp) * 0.5);
                attacker.effects.shield += shieldAdd;
                 
                // تسجيل المصدر
                attacker.effects.shield_source = skill.id;
                attacker.effects.shield_cd_duration = cooldownDuration;

                return `🍷 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** امتص حياة خصمه وحول الفائض لدرع!`;
            }
            attacker.hp += healVal;
             
            // في حالة عدم تفعيل الدرع، يجب تفعيل الكولداون الآن يدوياً لأننا أجلناه في البداية
            battleState.skillCooldowns[attackerId][skill.id] = cooldownDuration;
            attacker.effects.shield_source = null;

            return `🍷 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** امتص ${healVal} HP من خصمه!`;
        }
        case 'Chaos_RNG': {
            const dmg = Math.floor(baseAtk * 1.2);
            defender.hp -= dmg;
            const randomEffect = Math.random();
            let effectMsg = "";
            if (randomEffect < 0.25) { defender.effects.burn = Math.floor(baseAtk * 0.2); defender.effects.burn_turns = 3; effectMsg = "حرق"; }
            else if (randomEffect < 0.50) { defender.effects.weaken = 0.3; defender.effects.weaken_turns = 2; effectMsg = "إضعاف"; }
            else if (randomEffect < 0.75) { defender.effects.confusion = true; defender.effects.confusion_turns = 2; effectMsg = "ارتباك"; }
            else { defender.effects.poison = Math.floor(baseAtk * 0.15); defender.effects.poison_turns = 3; effectMsg = "سم"; }
            return `🌀 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** سبب فوضى (${effectMsg})!`;
        }
        case 'Dmg_Evasion': {
            const dmg = Math.floor(baseAtk * 1.3);
            defender.hp -= dmg;
            attacker.effects.evasion = 1; attacker.effects.evasion_turns = 1;
            return `👻 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** ضرب واختفى (مراوغة تامة)!`;
        }
        case 'Reflect_Tank': {
            attacker.effects.shield += Math.floor(attacker.maxHp * 0.2);
            attacker.effects.rebound_active = 0.4; attacker.effects.rebound_turns = 2;
            // تسجيل المصدر
            attacker.effects.shield_source = skill.id;
            attacker.effects.shield_cd_duration = cooldownDuration;
            return `🔨 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** تحصن بالجبل (دفاع وعكس ضرر)!`;
        }
        case 'Execute_Heal': {
            const dmg = Math.floor(baseAtk * 1.6);
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
                    // تسجيل المصدر
                    attacker.effects.shield_source = skill.id;
                    attacker.effects.shield_cd_duration = cooldownDuration;
                    return `🛡️ **${attacker.isMonster ? attacker.name : attacker.member.displayName}** اكتسب درعاً!`;
                 
                case 'skill_buffing': attacker.effects.buff = effectValue / 100; attacker.effects.buff_turns = 3; return `💪 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** رفع قوته!`;
                case 'skill_rebound': attacker.effects.rebound_active = effectValue / 100; attacker.effects.rebound_turns = 3; return `🔄 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** جهز الانعكاس!`;
                case 'skill_healing': const heal = Math.floor(attacker.maxHp * (effectValue / 100)); attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal); return `💖 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** استعاد ${heal} HP!`;
                case 'skill_poison': defender.effects.poison = Math.floor(baseAtk * (effectValue / 100)); defender.effects.poison_turns = 3; return `☠️ **${attacker.isMonster ? attacker.name : attacker.member.displayName}** سمم خصمه!`;
                case 'skill_weaken': defender.effects.weaken = effectValue / 100; defender.effects.weaken_turns = 3; return `📉 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** أضعف خصمه!`;
                case 'skill_dispel': defender.effects = { shield: 0, buff: 0, buff_turns: 0, weaken: 0, weaken_turns: 0, poison: 0, poison_turns: 0, rebound_active: 0, rebound_turns: 0, penetrate: 0, burn: 0, burn_turns: 0, stun: false, stun_turns: 0, confusion: false, confusion_turns: 0, evasion: 0, evasion_turns: 0, blind: 0, blind_turns: 0 }; return `💨 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** بدد كل سحر الخصم!`;
                case 'skill_cleanse': 
                    attacker.effects.poison = 0; attacker.effects.poison_turns = 0; attacker.effects.burn = 0; attacker.effects.burn_turns = 0;
                    attacker.effects.weaken = 0; attacker.effects.weaken_turns = 0; attacker.effects.stun = false; attacker.effects.stun_turns = 0;
                    attacker.effects.confusion = false; attacker.effects.confusion_turns = 0; attacker.effects.blind = 0; attacker.effects.blind_turns = 0;
                    return `✨ **${attacker.isMonster ? attacker.name : attacker.member.displayName}** طهر نفسه من اللعنات!`;
                default: const d = calculateDamage(attacker, defender, skill.stat_type === '%' ? 1.5 : 1); defender.hp -= d; return `💥 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** استخدم ${skill.name} وسبب ${d} ضرر!`;
            }
    }
}

function buildBattleEmbed(battleState, skillSelectionMode = false, skillPage = 0, disableAll = false) {
    const [attackerId, defenderId] = battleState.turn;
    const attacker = battleState.players.get(attackerId);
    const defender = battleState.players.get(defenderId);
     
    const embed = new EmbedBuilder()
        .setTitle('⚔️ مبارزة الموت: ضد فارس الإمبراطور')
        .setColor('#D6D4D4')
        .setImage(KNIGHT_IMAGES.MAIN);

    embed.addFields(
        { 
            name: `${attacker.isMonster ? attacker.name : cleanDisplayName(attacker.member.user.displayName)}`, 
            value: `HP: ${buildHpBar(attacker.hp, attacker.maxHp)}\nتأثيرات: ${buildEffectsString(attacker.effects)}`, 
            inline: true 
        },
        { 
            name: `${defender.isMonster ? defender.name : cleanDisplayName(defender.member.user.displayName)}`, 
            value: `HP: ${buildHpBar(defender.hp, defender.maxHp)}\nتأثيرات: ${buildEffectsString(defender.effects)}`, 
            inline: true 
        }
    );

    embed.setDescription(`**قـُبـض عليـك قاتل لتنجـو!**\nفارس الإمبراطور يغلق الابواب!\nالدور الآن لـ: **${attacker.isMonster ? attacker.name : attacker.member}**`);

    if (battleState.log.length > 0) {
        embed.addFields({ name: "📝 سجل المعركة:", value: battleState.log.slice(-3).join('\n'), inline: false });
    }

    const componentsToSend = [];

    if (skillSelectionMode) {
        const userSkills = attacker.skills || {};
        const availableSkills = Object.values(userSkills).filter(s => s.currentLevel > 0 || s.id.startsWith('race_'));
        const skillsPerPage = 4;
        const totalPages = Math.ceil(availableSkills.length / skillsPerPage);
         
        page = Math.max(0, Math.min(skillPage, totalPages - 1));
        if (totalPages === 0) page = 0;
        battleState.skillPage = page;

        if (availableSkills.length > 0) {
            const skillsToShow = availableSkills.slice(page * skillsPerPage, (page * skillsPerPage) + skillsPerPage);
            const skillButtons = new ActionRowBuilder();
            const cooldowns = battleState.skillCooldowns[attackerId] || {};

            skillsToShow.forEach(skill => {
                let emoji = skill.emoji || '✨';
                const isOnCooldown = (cooldowns[skill.id] || 0) > 0;
                const label = isOnCooldown ? `${skill.name} (${cooldowns[skill.id]})` : skill.name;
                skillButtons.addComponents(new ButtonBuilder()
                    .setCustomId(`knight_skill_use_${skill.id}`)
                    .setLabel(label).setEmoji(emoji).setStyle(isOnCooldown ? ButtonStyle.Secondary : ButtonStyle.Primary).setDisabled(disableAll || isOnCooldown)
                );
            });
            componentsToSend.push(skillButtons);
        } else {
            componentsToSend.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('no_skills').setLabel('لا توجد مهارات').setStyle(ButtonStyle.Secondary).setDisabled(true)));
        }

        const navRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('knight_skill_back').setLabel('العودة').setStyle(ButtonStyle.Danger).setDisabled(disableAll));
        if (totalPages > 1) {
            navRow.addComponents(
                new ButtonBuilder().setCustomId(`knight_skill_page_${page - 1}`).setLabel('▶️').setStyle(ButtonStyle.Secondary).setDisabled(disableAll || page === 0),
                new ButtonBuilder().setCustomId(`knight_skill_page_${page + 1}`).setLabel('▶️').setStyle(ButtonStyle.Secondary).setDisabled(disableAll || page === totalPages - 1)
            );
        }
        componentsToSend.push(navRow);

    } else {
        const mainButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('knight_attack').setLabel('هـجـوم').setStyle(ButtonStyle.Danger).setEmoji('⚔️').setDisabled(disableAll),
            new ButtonBuilder().setCustomId('knight_skill_menu').setLabel('مـهــارات').setStyle(ButtonStyle.Primary).setEmoji('✨').setDisabled(disableAll)
        );
        componentsToSend.push(mainButtons);
    }

    return { embeds: [embed], components: componentsToSend };
}

function setupBattleCollector(battleState) {
    const robberId = battleState.turn[0]; 
    const filter = i => i.user.id === robberId && i.customId.startsWith('knight_');
    const collector = battleState.message.createMessageComponentCollector({ filter, componentType: ComponentType.Button, time: 300000 });

    collector.on('collect', async i => {
        if (battleState.processingTurn) return i.deferUpdate().catch(()=>{});

        try {
            const customId = i.customId;
            const player = battleState.players.get(i.user.id);
            const guard = battleState.players.get("guard");

            if (customId === 'knight_attack') {
                battleState.processingTurn = true;
                const dmg = calculateDamage(player, guard);
                guard.hp -= dmg;
                battleState.log.push(`⚔️ **${cleanDisplayName(player.member.user.displayName)}** هاجم الفارس وسبب **${dmg}** ضرر!`);
                 
                // 🔥 فحص انكسار درع الفارس 🔥
                const breakMsg = checkShieldBreak(battleState, "guard");
                if (breakMsg) battleState.log.push(breakMsg);

                battleState.turn = ["guard", player.member.id];
                await i.update(buildBattleEmbed(battleState, false, 0, true));
                await processGuardTurn(battleState);
            } 
            else if (customId === 'knight_skill_menu') await i.update(buildBattleEmbed(battleState, true, 0));
            else if (customId === 'knight_skill_back') await i.update(buildBattleEmbed(battleState, false));
            else if (customId.startsWith('knight_skill_page_')) {
                const newPage = parseInt(customId.split('_')[3]);
                await i.update(buildBattleEmbed(battleState, true, newPage));
            } 
            else if (customId.startsWith('knight_skill_use_')) {
                battleState.processingTurn = true; 
                const skillId = customId.replace('knight_skill_use_', '');
                const skillData = player.skills[skillId];
                if (skillData) {
                    const logMsg = applySkillEffect(battleState, i.user.id, skillData);
                    battleState.log.push(logMsg);
                     
                    // 🔥 فحص انكسار درع الفارس (إذا كانت المهارة هجومية) 🔥
                    const breakMsg = checkShieldBreak(battleState, "guard");
                    if (breakMsg) battleState.log.push(breakMsg);

                    battleState.turn = ["guard", player.member.id];
                    await i.update(buildBattleEmbed(battleState, false, 0, true));
                    await processGuardTurn(battleState);
                }
            }
        } catch (error) {
            console.error("Collector Error:", error);
            battleState.processingTurn = false;
            await i.editReply(buildBattleEmbed(battleState, false, 0, false)).catch(()=>{});
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time' && !battleState.isEnded) {
            handleGuardBattleEnd(battleState, "guard", "lose");
        }
    });
}

// =================================================================
// 🧠 ذكاء الفارس (AI) - [تم تحديثه بالكامل ليصبح أذكى] 🔥
// =================================================================
async function processGuardTurn(battleState) {
    try {
        const guard = battleState.players.get("guard");
        const playerMemberId = Array.from(battleState.players.keys()).find(id => id !== "guard");
        const player = battleState.players.get(playerMemberId);

        // تقليل الكولداون
        const playerCooldowns = battleState.skillCooldowns[playerMemberId];
        if (playerCooldowns) {
            for (const skillId in playerCooldowns) {
                if (playerCooldowns[skillId] > 0) playerCooldowns[skillId]--;
            }
        }

        // تأثيرات الحالة (سم، حرق)
        const { logEntries, skipTurn } = applyPersistentEffects(battleState, "guard");
        if (logEntries.length > 0) battleState.log.push(...logEntries);

        // التحقق من الموت
        if (guard.hp <= 0) {
            battleState.processingTurn = false;
            return await handleGuardBattleEnd(battleState, playerMemberId, "win");
        }

        await battleState.message.edit(buildBattleEmbed(battleState, false, 0, true));

        // إذا كان الفارس مشلولاً
        if (skipTurn) {
            battleState.log.push(`💤 **فارس الإمبراطور** مشلول ولا يستطيع الحركة!`);
            battleState.turn = [playerMemberId, "guard"];
            battleState.processingTurn = false;
            await battleState.message.edit(buildBattleEmbed(battleState, false, 0, false));
            return;
        }

        // تأخير التفكير
        await new Promise(r => setTimeout(r, 1500));

        // ==============================================
        // 🧠 منطق الذكاء الاصطناعي (AI Logic)
        // ==============================================
        let actionLog = "";
         
        // 🔥 ترتيب جديد للأولويات (البقاء أولاً!) 🔥

        // 1. استخدام "قداس الدم" إذا قلت الصحة عن 30% (أولوية قصوى للعلاج والهجوم معاً)
        if (guard.hp < guard.maxHp * 0.30 && guard.effects.blood_liturgy_used < 5) {
            const drainDmg = Math.floor(guard.weapon.currentDamage * 1.5); // ضربة قوية (1.5x)
            player.hp -= drainDmg;
             
            // زيادة الشفاء قليلاً لضمان التأثير
            const healAmt = Math.max(Math.floor(drainDmg * 0.8), Math.floor(guard.maxHp * 0.15));
            guard.hp = Math.min(guard.maxHp, guard.hp + healAmt);

            guard.effects.blood_liturgy_used++; // زيادة العداد

            actionLog = `🩸 **فارس الإمبراطور** يلفظ أنفاسه ويستخدم "قداس الدم"! امتص **${drainDmg}** من صحتك وشفى نفسه (+${healAmt})! (${guard.effects.blood_liturgy_used}/5)`;
             
            const breakMsg = checkShieldBreak(battleState, playerMemberId);
            if (breakMsg) actionLog += `\n${breakMsg}`;
        }
        // 2. استخدام "جرعات الطوارئ" إذا قلت الصحة عن 50% (للبقاء على قيد الحياة)
        else if (guard.hp < guard.maxHp * 0.50 && guard.effects.potions_used < 5) {
            const healAmount = Math.floor(guard.maxHp * 0.25); // 25% شفاء
            guard.hp = Math.min(guard.maxHp, guard.hp + healAmount);
             
            const shieldAmt = Math.floor(guard.maxHp * 0.10);
            guard.effects.shield += shieldAmt;

            guard.effects.potions_used++; // زيادة عداد الجرعات

            actionLog = `🧪 **فارس الإمبراطور** شرب جرعة الطوارئ واستعاد **${healAmount}** HP واكتسب درعاً! (${guard.effects.potions_used}/5)`;
        }
        // 3. القضاء على اللاعب الضعيف (Priority Kill) - يأتي بعد محاولة النجاة
        else if (player.hp < player.maxHp * 0.20) {
            const dmg = calculateDamage(guard, player, 1.5);
            player.hp -= dmg;
            actionLog = `💀 **فارس الإمبراطور** رأى ضعفك واستخدم "إعدام"! سبب **${dmg}** ضرر!`;
            const breakMsg = checkShieldBreak(battleState, playerMemberId);
            if (breakMsg) actionLog += `\n${breakMsg}`;
        }
        // 4. كسر درع اللاعب (Shield Breaker)
        else if (player.effects.shield > 0) {
            const dmg = calculateDamage(guard, player, 1.3); 
            player.hp -= dmg;
            actionLog = `🔨 **فارس الإمبراطور** سدد ضربة ثقيلة لتحطيم درعك! سبب **${dmg}** ضرر!`;
            const breakMsg = checkShieldBreak(battleState, playerMemberId);
            if (breakMsg) actionLog += `\n${breakMsg}`;
        }
        // 5. مواجهة البفات القوية (Counter Buffs) - معدل ليصبح نادراً (20%)
        else if (player.effects.buff > 0 && Math.random() < 0.20) {
            guard.effects.rebound_active = 0.5; 
            guard.effects.rebound_turns = 1;
            actionLog = `🛡️ **فارس الإمبراطور** لاحظ قوتك واتخذ وضعية "انعكاس الضرر"! (احذر من الهجوم)`;
        }
        // 6. هجوم عادي (Standard Attack)
        else {
            let multiplier = 1.0;
            if (player.effects.buff > 0) multiplier = 1.1;

            const dmg = calculateDamage(guard, player, multiplier);
            player.hp -= dmg;
             
            const breakMsg = checkShieldBreak(battleState, playerMemberId);
            if (breakMsg) actionLog += `${breakMsg}\n`;

            if (Math.random() < 0.2) {
                player.effects.burn = Math.floor(guard.weapon.currentDamage * 0.1);
                player.effects.burn_turns = 2;
                actionLog += `⚔️ **فارس الإمبراطور** جرحك وسـبب نزيفاً! (**${dmg}** ضرر)`;
            } else {
                actionLog += `⚔️ **فارس الإمبراطور** هاجمك وسبب **${dmg}** ضرر!`;
            }
        }

        battleState.log.push(actionLog);

        if (player.hp <= 0) {
            battleState.processingTurn = false;
            return await handleGuardBattleEnd(battleState, "guard", "lose");
        }

        battleState.turn = [playerMemberId, "guard"];
        battleState.processingTurn = false;
        await battleState.message.edit(buildBattleEmbed(battleState, false, 0, false));

    } catch (error) {
        console.error("AI Error:", error);
        battleState.processingTurn = false;
        await battleState.message.edit(buildBattleEmbed(battleState, false, 0, false));
    }
}

async function startGuardBattle(interaction, client, sql, robberMember, amountToSteal) {
    try {
        const getLevel = client.getLevel;
        let robberData = getLevel.get(robberMember.id, interaction.guild.id) || { ...client.defaultData, user: robberMember.id, guild: interaction.guild.id };
        
        const pMaxHp = BASE_HP + (robberData.level * HP_PER_LEVEL);
        let robberWeapon = getWeaponData(sql, robberMember);
        if (!robberWeapon || robberWeapon.currentLevel === 0) {
            robberWeapon = { name: "قبضة يد", currentDamage: 15 };
        }
        const robberSkills = getAllSkillData(sql, robberMember);

        // ========================================================
        // 🔥🔥 نظام غضب الفارس (تصاعد القوة مع التكرار) 🔥🔥
        // ========================================================
        
        // 1. إنشاء الجدول إذا لم يكن موجوداً
        sql.prepare("CREATE TABLE IF NOT EXISTS knight_history (id TEXT PRIMARY KEY, count INTEGER, lastDate INTEGER)").run();

        const today = new Date().setHours(0, 0, 0, 0); // تاريخ اليوم (بدون وقت)
        const userId = robberMember.id;
        const guildId = interaction.guild.id;
        const historyId = `${userId}-${guildId}`;

        // 2. جلب سجل اللاعب
        let history = sql.prepare("SELECT * FROM knight_history WHERE id = ?").get(historyId);

        let encounterCount = 1; // الافتراضي: المرة الأولى

        if (history) {
            // إذا كان تاريخ آخر مواجهة هو اليوم
            if (history.lastDate === today) {
                encounterCount = history.count + 1; // زيادة العداد
                sql.prepare("UPDATE knight_history SET count = ? WHERE id = ?").run(encounterCount, historyId);
            } else {
                // إذا كان تاريخاً قديماً (يوم جديد)، نصفر العداد
                encounterCount = 1;
                sql.prepare("UPDATE knight_history SET count = ?, lastDate = ? WHERE id = ?").run(1, today, historyId);
            }
        } else {
            // أول مرة يواجه الفارس إطلاقاً
            sql.prepare("INSERT INTO knight_history (id, count, lastDate) VALUES (?, ?, ?)").run(historyId, 1, today);
        }

        // 🔥 3. تطبيق المضاعف (Multiplier) بناءً على عدد مرات المواجهة 🔥
        const multiplier = encounterCount; 

        // 📊 طباعة للتأكد من التكرار
        console.log(`[Knight Battle] Encounter #${multiplier} for ${robberMember.displayName}`);

        // 🔥🔥🔥 الموازنة الجديدة 🔥🔥🔥
        // 1. صحة الفارس
        const guardMaxHp = Math.floor(pMaxHp * 1.8 * multiplier); 
        
        // 2. هجوم الفارس = (سلاح اللاعب * النسبة) + (زيادة ثابتة لكل تكرار لضمان القوة)
        // إضافة 20 ضرر ثابت لكل مستوى غضب
        const atkMultiplier = 1.4 + ((multiplier - 1) * 0.5); 
        const baseDmg = Math.floor(robberWeapon.currentDamage * atkMultiplier);
        const flatBonus = (multiplier - 1) * 20; // +0, +20, +40...
        
        const finalGuardDmg = baseDmg + flatBonus;

        const guardWeapon = { 
            name: `نصل الإمبراطور ${multiplier > 1 ? `(غضب x${multiplier})` : ''}`, 
            currentDamage: finalGuardDmg
        };

        // 3. درع مبدئي بسيط (10%)
        const initialShield = Math.floor(guardMaxHp * 0.1);

        // 🔥 تحديث الكائن ليتضمن عدادات المهارات الجديدة 🔥
        const defEffects = () => ({ 
            shield: 0, buff: 0, buff_turns: 0, weaken: 0, weaken_turns: 0, 
            poison: 0, poison_turns: 0, burn: 0, burn_turns: 0, 
            rebound_active: 0, rebound_turns: 0, stun: false, stun_turns: 0, 
            confusion: false, confusion_turns: 0, evasion: 0, evasion_turns: 0, 
            blind: 0, blind_turns: 0, shield_source: null, shield_cd_duration: 0,
            potions_used: 0,       // عداد الجرعات
            blood_liturgy_used: 0  // عداد قداس الدم
        });
        
        const guardEffects = defEffects();
        guardEffects.shield = initialShield;

        // رسالة تحذيرية إذا كان الفارس غاضباً
        let introMsg = `🛡️ **فارس الإمبراطور** يغلق الأبواب! "لن تخرج من هنا حياً!"`;
        if (multiplier > 1) {
            introMsg = `🔥🛡️ **فارس الإمبراطور (غاضب x${multiplier})** يتذكر وجهك! "عدت للموت مجدداً؟ هذه المرة لن أرحمك!"`;
        }

        const battleState = {
            isPvE: true, isGuardBattle: true, amountToSteal,
            message: null, turn: [robberMember.id, "guard"], processingTurn: false,
            isEnded: false, 
            log: [introMsg], 
            skillPage: 0, skillCooldowns: { [robberMember.id]: {}, "guard": {} },
            players: new Map([
                [robberMember.id, { isMonster: false, member: robberMember, hp: pMaxHp, maxHp: pMaxHp, weapon: robberWeapon, skills: robberSkills, effects: defEffects() }],
                ["guard", { isMonster: true, name: `فـارس الإمبراطور ${multiplier > 1 ? `(x${multiplier})` : ''}`, hp: guardMaxHp, maxHp: guardMaxHp, weapon: guardWeapon, skills: {}, effects: guardEffects }]
            ])
        };

        activePveBattles.set(interaction.channel.id, battleState);
        
        const { embeds, components } = buildBattleEmbed(battleState, false, 0, false);
        const msgPayload = { content: `**قـاتـل لتنجـو بحيـاتـك!** <@${robberMember.id}>`, embeds, components };

        let sentMsg;
        if (interaction.isRepliable && !interaction.replied) {
            const response = await interaction.reply({ ...msgPayload, withResponse: true });
            sentMsg = response.resource ? response.resource.message : response; 
        } else {
            sentMsg = await interaction.channel.send(msgPayload);
        }
        
        battleState.message = sentMsg;
        setupBattleCollector(battleState);
        
    } catch (error) {
        console.error("Error starting knight battle:", error);
        activePveBattles.delete(interaction.channel.id);
    }
}

async function handleGuardBattleEnd(battleState, winnerId, resultType) {
    if (battleState.isEnded) return;
    battleState.isEnded = true;

    try {
        const client = battleState.message.client;
        const playerMemberId = Array.from(battleState.players.keys()).find(id => id !== "guard");
        const player = battleState.players.get(playerMemberId);
        
        const setScore = client.setLevel;
        const getScore = client.getLevel;
        
        let playerData = getScore.get(player.member.id, battleState.message.guild.id);
        const amount = battleState.amountToSteal;

        const embed = new EmbedBuilder();
        activePveBattles.delete(battleState.message.channel.id);

        await battleState.message.edit({ components: [] }).catch(() => {});

        if (resultType === "win") {
            playerData.mora += amount;
            setScore.run(playerData);
            embed.setTitle(`🏆 هــروب نــاجــح!`).setColor(Colors.Green)
                 .setDescription(`تمكنت من هزيمة فارس الإمبراطور والفرار بالغنيمة!\n\n💰 **المبلغ المسروق:** ${amount.toLocaleString()} ${EMOJI_MORA}`)
                 .setImage(KNIGHT_IMAGES.WIN);
        } else {
            if (playerData.mora >= amount) playerData.mora -= amount;
            else {
                const remaining = amount - playerData.mora;
                playerData.mora = 0;
                playerData.bank = Math.max(0, playerData.bank - remaining);
            }
            setScore.run(playerData);
            embed.setTitle(`💀 هـُزمـت!`).setColor(Colors.DarkRed)
                 .setDescription(` قـتـلـك فارس الإمبراطور... \n\n**الغرامة المدفوعة ✶ :** ${amount.toLocaleString()} ${EMOJI_MORA}`)
                 .setImage(KNIGHT_IMAGES.LOSE);
        }

        await battleState.message.channel.send({ content: `<@${player.member.id}>`, embeds: [embed] });
    } catch (error) {
        console.error("End Game Error:", error);
    }
}

module.exports = { startGuardBattle, processGuardTurn, activePveBattles };
