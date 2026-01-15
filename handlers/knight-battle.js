const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors, ComponentType } = require("discord.js");
const path = require('path');

// ==========================================
// ⚙️ إعدادات المسارات والملفات (نفس كود الوحش)
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
    WIN: 'https://i.postimg.cc/xd8msjxk/escapar-a-toda-velocidad.gif', 
    LOSE: 'https://i.postimg.cc/d1ndBX7B/download.gif'
};

// خريطة لتخزين المعارك النشطة
const activePveBattles = new Map();

// ==========================================
// 🛠️ دوال مساعدة (منسوخة بدقة من الكود المرسل)
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

// ⚠️ منطق حساب الضرر (نسخ لصق من الكود الأصلي)
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

// ⚠️ منطق التأثيرات المستمرة (نسخ لصق)
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

// ⚠️ منطق تنفيذ المهارات (نسخ لصق كامل لكل الحالات)
function applySkillEffect(battleState, attackerId, skill) {
    const cooldownDuration = skill.id.startsWith('race_') ? 5 : 3;
    if (!battleState.skillCooldowns[attackerId]) battleState.skillCooldowns[attackerId] = {};
    battleState.skillCooldowns[attackerId][skill.id] = cooldownDuration;

    const attacker = battleState.players.get(attackerId);
    const defenderId = Array.from(battleState.players.keys()).find(id => id !== attackerId);
    const defender = battleState.players.get(defenderId);

    const effectValue = skill.effectValue;
    const statType = skill.stat_type;

    let baseAtk = attacker.weapon ? attacker.weapon.currentDamage : 15;
    if (attacker.effects.buff > 0) baseAtk *= (1 + attacker.effects.buff);
    if (attacker.effects.weaken > 0) baseAtk *= (1 - attacker.effects.weaken);

    switch (statType) {
        // 🔥🔥 مهارة الروح الجديدة 🔥🔥
        case 'Spirit_RNG': {
            // 1. حساب الضرر الأساسي للمهارة (مثلاً 1.3x)
            const spiritDmg = Math.floor(baseAtk * 1.3);
            defender.hp -= spiritDmg;

            // 2. حساب الاحتمالات
            const roll = Math.random() * 100; // 0 - 100
            let effectMsg = "";

            if (roll < 2) { 
                // 2% - لعنة الرعب (شلل)
                defender.effects.stun = true;
                defender.effects.stun_turns = 1;
                effectMsg = "😱 **لعنة الرعب!** (شلل)";
            } 
            else if (roll < 7) { 
                // 5% - تلبس (عكس الضرر 100%)
                // ملاحظة: من 2 لـ 7 تساوي 5% تقريباً
                attacker.effects.rebound_active = 1.0; // 100% عكس
                attacker.effects.rebound_turns = 2;
                effectMsg = "👻 **تلبس!** (عكس الضرر القادم)";
            } 
            else if (roll < 57) { 
                // 50% - سرقة الروح (بف لك ودبف للخصم)
                // من 7 لـ 57 تساوي 50%
                attacker.effects.buff = (attacker.effects.buff || 0) + 0.15;
                attacker.effects.buff_turns = 3;
                defender.effects.weaken = (defender.effects.weaken || 0) + 0.15;
                defender.effects.weaken_turns = 3;
                effectMsg = "💀 **سرقة الروح!** (امتصاص القوة)";
            } 
            else {
                // الباقي: مجرد ضرر طيفي
                effectMsg = "(هجوم طيفي)";
            }

            return `👻 **${cleanDisplayName(attacker.member.user.displayName)}** أطلق طيفاً! سبب **${spiritDmg}** ضرر + ${effectMsg}`;
        }

        case 'TrueDMG_Burn': {
            const burnDmg = Math.floor(baseAtk * 0.2);
            defender.effects.burn = burnDmg;
            defender.effects.burn_turns = 3;
            const dmg = Math.floor(baseAtk * 1.4); 
            defender.hp -= dmg;
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
            const dmg = Math.floor(baseAtk * 2.0);
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
                    defender.effects = { shield: 0, buff: 0, buff_turns: 0, weaken: 0, weaken_turns: 0, poison: 0, poison_turns: 0, rebound_active: 0, rebound_turns: 0, penetrate: 0, burn: 0, burn_turns: 0, stun: false, stun_turns: 0, confusion: false, confusion_turns: 0, evasion: 0, evasion_turns: 0, blind: 0, blind_turns: 0 };
                    return `💨 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** بدد كل سحر الخصم!`;
                case 'skill_cleanse':
                    attacker.effects.poison = 0; attacker.effects.poison_turns = 0;
                    attacker.effects.burn = 0; attacker.effects.burn_turns = 0;
                    attacker.effects.weaken = 0; attacker.effects.weaken_turns = 0;
                    attacker.effects.stun = false; attacker.effects.stun_turns = 0;
                    attacker.effects.confusion = false; attacker.effects.confusion_turns = 0;
                    attacker.effects.blind = 0; attacker.effects.blind_turns = 0;
                    return `✨ **${attacker.isMonster ? attacker.name : attacker.member.displayName}** طهر نفسه من اللعنات!`;
                default:
                    const d = calculateDamage(attacker, defender, skill.stat_type === '%' ? 1.5 : 1);
                    defender.hp -= d;
                    return `💥 **${attacker.isMonster ? attacker.name : attacker.member.displayName}** استخدم ${skill.name} وسبب ${d} ضرر!`;
            }
    }
}

// =================================================================
// 🎨 بناء واجهة المعركة (Embed)
// =================================================================
function buildBattleEmbed(battleState, skillSelectionMode = false, skillPage = 0, disableAll = false) {
    const [attackerId, defenderId] = battleState.turn;
    const attacker = battleState.players.get(attackerId);
    const defender = battleState.players.get(defenderId);
    
    // تصميم خاص بفارس الإمبراطور
    const embed = new EmbedBuilder()
        .setTitle('⚔️ مبارزة الموت: ضد فارس الإمبراطور')
        .setColor('#D6D4D4') // رمادي فضي
        .setImage(KNIGHT_IMAGES.MAIN);

    // إضافة معلومات الصحة والتأثيرات
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

    embed.setDescription(`🚨 **حالة الطوارئ!**\nفارس الإمبراطور يغلق المنافذ!\nالدور الآن لـ: **${attacker.isMonster ? attacker.name : attacker.member}**`);

    if (battleState.log.length > 0) {
        embed.addFields({ name: "📝 سجل المعركة:", value: battleState.log.slice(-3).join('\n'), inline: false });
    }

    const componentsToSend = [];

    // إذا كان وضع اختيار المهارات
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
                    .setLabel(label)
                    .setEmoji(emoji)
                    .setStyle(isOnCooldown ? ButtonStyle.Secondary : ButtonStyle.Primary)
                    .setDisabled(disableAll || isOnCooldown)
                );
            });
            componentsToSend.push(skillButtons);
        } else {
            componentsToSend.push(new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('no_skills').setLabel('لا توجد مهارات').setStyle(ButtonStyle.Secondary).setDisabled(true)
            ));
        }

        const navRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('knight_skill_back').setLabel('العودة').setStyle(ButtonStyle.Danger).setDisabled(disableAll)
        );
        if (totalPages > 1) {
            navRow.addComponents(
                new ButtonBuilder().setCustomId(`knight_skill_page_${page - 1}`).setLabel('▶️').setStyle(ButtonStyle.Secondary).setDisabled(disableAll || page === 0),
                new ButtonBuilder().setCustomId(`knight_skill_page_${page + 1}`).setLabel('▶️').setStyle(ButtonStyle.Secondary).setDisabled(disableAll || page === totalPages - 1)
            );
        }
        componentsToSend.push(navRow);

    } else {
        // الأزرار الرئيسية
        const mainButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('knight_attack').setLabel('هـجـوم').setStyle(ButtonStyle.Danger).setEmoji('⚔️').setDisabled(disableAll),
            new ButtonBuilder().setCustomId('knight_skill_menu').setLabel('مـهــارات').setStyle(ButtonStyle.Primary).setEmoji('✨').setDisabled(disableAll)
        );
        componentsToSend.push(mainButtons);
    }

    return { embeds: [embed], components: componentsToSend };
}

// =================================================================
// 🎮 إنشاء المستمع (Collector)
// =================================================================
function setupBattleCollector(battleState) {
    const robberId = battleState.turn[0]; 
    const filter = i => i.user.id === robberId && i.customId.startsWith('knight_');
    
    // إنشاء الكوليكتور
    const collector = battleState.message.createMessageComponentCollector({ filter, componentType: ComponentType.Button, time: 300000 });

    collector.on('collect', async i => {
        // حماية من الضغط المتكرر
        if (battleState.processingTurn) return i.deferUpdate().catch(()=>{});

        try {
            const customId = i.customId;
            const player = battleState.players.get(i.user.id);
            const guard = battleState.players.get("guard");

            // 1. هجوم
            if (customId === 'knight_attack') {
                battleState.processingTurn = true;

                const dmg = calculateDamage(player, guard);
                guard.hp -= dmg;
                battleState.log.push(`⚔️ **${cleanDisplayName(player.member.user.displayName)}** هاجم الفارس وسبب **${dmg}** ضرر!`);
                
                // تحديث الواجهة وتعطيل الأزرار
                battleState.turn = ["guard", player.member.id];
                await i.update(buildBattleEmbed(battleState, false, 0, true));
                
                await processGuardTurn(battleState);
            } 
            // 2. قائمة المهارات
            else if (customId === 'knight_skill_menu') {
                await i.update(buildBattleEmbed(battleState, true, 0));
            } 
            // 3. العودة من المهارات
            else if (customId === 'knight_skill_back') {
                await i.update(buildBattleEmbed(battleState, false));
            } 
            // 4. تصفح المهارات
            else if (customId.startsWith('knight_skill_page_')) {
                const newPage = parseInt(customId.split('_')[3]);
                await i.update(buildBattleEmbed(battleState, true, newPage));
            } 
            // 5. استخدام المهارة
            else if (customId.startsWith('knight_skill_use_')) {
                battleState.processingTurn = true; // قفل

                const skillId = customId.replace('knight_skill_use_', '');
                const skillData = player.skills[skillId];
                
                if (skillData) {
                    const logMsg = applySkillEffect(battleState, i.user.id, skillData);
                    battleState.log.push(logMsg);
                    
                    battleState.turn = ["guard", player.member.id];
                    await i.update(buildBattleEmbed(battleState, false, 0, true));
                    
                    await processGuardTurn(battleState);
                }
            }
        } catch (error) {
            console.error("Collector Error:", error);
            battleState.processingTurn = false;
            // محاولة إعادة الأزرار في حال الخطأ
            await i.editReply(buildBattleEmbed(battleState, false, 0, false)).catch(()=>{});
        }
    });

    // 🔥🔥🔥 التصحيح الأساسي لمشكلة السحبة 🔥🔥🔥
    collector.on('end', (collected, reason) => {
        // إذا انتهى الوقت ولم تنتهِ المعركة بعد، نعتبرها انسحاب (خسارة)
        if (reason === 'time' && !battleState.isEnded) {
            handleGuardBattleEnd(battleState, "guard", "lose");
        }
    });
}

// =================================================================
// 🧠 ذكاء الفارس (AI)
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

        // تحديث الرسالة (لإظهار تأثيرات السم مثلاً)
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

        // هجوم الفارس
        let actionLog = "";
        const baseDmg = guard.weapon.currentDamage;
        
        // ذكاء اصطناعي بسيط
        if (guard.hp < guard.maxHp * 0.30 && Math.random() < 0.7) {
            const healAmount = Math.floor(guard.maxHp * 0.25);
            guard.hp = Math.min(guard.maxHp, guard.hp + healAmount);
            actionLog = `💖 **فارس الإمبراطور** شرب جرعة واستعاد ${healAmount} HP!`;
        } else if (player.hp < player.maxHp * 0.25 && Math.random() < 0.8) {
            const dmg = calculateDamage(guard, player, 1.5);
            player.hp -= dmg;
            actionLog = `💀 **فارس الإمبراطور** استخدم "إعدام"! سبب **${dmg}** ضرر!`;
        } else {
            const dmg = calculateDamage(guard, player, 1.0);
            player.hp -= dmg;
            actionLog = `⚔️ **فارس الإمبراطور** هاجمك وسبب **${dmg}** ضرر!`;
        }

        battleState.log.push(actionLog);

        if (player.hp <= 0) {
            battleState.processingTurn = false;
            return await handleGuardBattleEnd(battleState, "guard", "lose");
        }

        // إعادة الدور للاعب
        battleState.turn = [playerMemberId, "guard"];
        battleState.processingTurn = false;
        await battleState.message.edit(buildBattleEmbed(battleState, false, 0, false));

    } catch (error) {
        console.error("AI Error:", error);
        battleState.processingTurn = false;
        await battleState.message.edit(buildBattleEmbed(battleState, false, 0, false));
    }
}

// =================================================================
// 🛡️ بدء المعركة
// =================================================================
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

        const guardMaxHp = pMaxHp; 
        const guardWeapon = { name: "نصل الإمبراطور", currentDamage: Math.floor(robberWeapon.currentDamage * 1.1) };

        const defEffects = () => ({ shield: 0, buff: 0, buff_turns: 0, weaken: 0, weaken_turns: 0, poison: 0, poison_turns: 0, burn: 0, burn_turns: 0, rebound_active: 0, rebound_turns: 0, stun: false, stun_turns: 0, confusion: false, confusion_turns: 0, evasion: 0, evasion_turns: 0, blind: 0, blind_turns: 0 });

        const battleState = {
            isPvE: true, isGuardBattle: true, amountToSteal,
            message: null, turn: [robberMember.id, "guard"], processingTurn: false,
            // 🔥 إضافة القفل هنا
            isEnded: false, 
            log: [`🛡️ **فارس الإمبراطور** يغلق الأبواب! "لن تخرج من هنا حياً بعد ان عفى عنك الامبراطـور!"`], 
            skillPage: 0, skillCooldowns: { [robberMember.id]: {}, "guard": {} },
            players: new Map([
                [robberMember.id, { isMonster: false, member: robberMember, hp: pMaxHp, maxHp: pMaxHp, weapon: robberWeapon, skills: robberSkills, effects: defEffects() }],
                ["guard", { isMonster: true, name: "فـارس الإمبراطور", hp: guardMaxHp, maxHp: guardMaxHp, weapon: guardWeapon, skills: {}, effects: defEffects() }]
            ])
        };

        activePveBattles.set(interaction.channel.id, battleState);
        
        const { embeds, components } = buildBattleEmbed(battleState, false, 0, false);
        const msgPayload = { content: `**قـاتـل لتنجـو بحيـاتـك!** <@${robberMember.id}>`, embeds, components };

        let sentMsg;
        if (interaction.isRepliable && !interaction.replied) sentMsg = await interaction.reply({ ...msgPayload, fetchReply: true });
        else sentMsg = await interaction.channel.send(msgPayload);
        
        battleState.message = sentMsg;
        setupBattleCollector(battleState);
        
    } catch (error) {
        console.error("Error starting knight battle:", error);
        activePveBattles.delete(interaction.channel.id);
    }
}

// =================================================================
// 🏁 نهاية المعركة
// =================================================================
async function handleGuardBattleEnd(battleState, winnerId, resultType) {
    // 🔥 حماية من التكرار
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
            embed.setTitle(`💀 تـم الـقـبـض!`).setColor(Colors.DarkRed)
                 .setDescription(` قـتـلـك فارس الإمبراطور... \n\n**الغرامة المدفوعة ✶ :** ${amount.toLocaleString()} ${EMOJI_MORA}`)
                 .setImage(KNIGHT_IMAGES.LOSE);
        }

        await battleState.message.channel.send({ content: `<@${player.member.id}>`, embeds: [embed] });
    } catch (error) {
        console.error("End Game Error:", error);
    }
}

module.exports = { startGuardBattle, processGuardTurn, activePveBattles };
