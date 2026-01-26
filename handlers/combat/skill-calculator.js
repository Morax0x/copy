// handlers/combat/skill-calculator.js

// ================================================================
// 🔥 COMBAT ENGINE: Skill Calculator (Balanced Version)
// المحرك المسؤول عن حساب أرقام وتأثيرات المهارات (يعتمد على لفل المهارة)
// ================================================================

const { cleanDisplayName } = require('../dungeon/utils');

// القيمة 5.0 تعني أن مهارة بقوة 100 تسبب 500 ضرر
const GLOBAL_SKILL_MULTIPLIER = 5.0;

/**
 * حساب القوة الخام للمهارة بناءً على مستواها
 */
function calculateSkillRawValue(skillConfig, currentLevel) {
    if (!skillConfig) return 0;
    const level = Math.max(1, currentLevel || 1);
    // القيمة الأساسية + (الزيادة * اللفل)
    return skillConfig.base_value + (skillConfig.value_increment * (level - 1));
}

/**
 * دالة مساعدة لجلب الاسم
 */
function getName(entity) {
    if (entity.isMonster) return entity.name;
    if (entity.member) return cleanDisplayName(entity.member.user.displayName);
    return entity.name || "Unknown";
}

/**
 * التنفيذ الرئيسي للمهارة
 */
function executeSkill(attacker, defender, skill, isOwner = false) {
    const result = {
        damage: 0, 
        heal: 0, 
        shield: 0, 
        selfDamage: 0,
        effectsApplied: [], // تأثيرات على الخصم
        selfEffects: [],    // تأثيرات على النفس
        log: ""
    };

    const multiplier = isOwner ? 10 : 1;
    
    // 1. حساب قوة المهارة الأساسية من اللفل
    const rawValue = calculateSkillRawValue(skill, skill.currentLevel);
    
    // 2. تحديد القوة النهائية (Skill Power)
    let skillPower = 0;

    // استثناءات خاصة: مهارات تعتمد على الصحة القصوى (للدروع والشفاء الكبير)
    // أو المهارات التي تتطلب حسابات خاصة بناء على الـ HP
    const hpBasedSkills = ['Reflect_Tank', 'Cleanse_Buff_Shield'];
    
    if (skill.id.includes('heal') || skill.id.includes('shield') || hpBasedSkills.includes(skill.stat_type)) {
        skillPower = Math.floor(attacker.maxHp * (rawValue / 100));
    } else {
        // الهجوم والضرر: يعتمد حصراً على رقم المهارة والمضاعف العام
        skillPower = Math.floor(rawValue * GLOBAL_SKILL_MULTIPLIER);
    }

    // =========================================================
    // 🔥 3. تطبيق البفات (Buffs) 🔥
    // =========================================================
    if (!skill.id.includes('heal') && !skill.id.includes('shield')) {
        let buffMultiplier = 1.0;

        // أ. دعم النظام القديم (Object)
        if (attacker.effects && !Array.isArray(attacker.effects)) {
             if (attacker.effects.buff > 0) buffMultiplier += attacker.effects.buff;
             if (attacker.effects.weaken > 0) buffMultiplier -= attacker.effects.weaken;
        }

        // ب. دعم النظام الجديد (Array - Dungeon)
        if (attacker.effects && Array.isArray(attacker.effects)) {
            attacker.effects.forEach(e => {
                if (e.type === 'atk_buff' || e.type === 'buff') buffMultiplier += e.val;
                if (e.type === 'weaken') buffMultiplier -= e.val;
            });
        }
        
        skillPower = Math.floor(skillPower * buffMultiplier);
    }
    
    // تطبيق مضاعف المالك (إن وجد)
    skillPower = Math.floor(skillPower * multiplier);

    // ====================================================
    // 🔮 منطق المهارات (Stat Types Logic)
    // ====================================================

    switch (skill.stat_type) {
        
        case 'Gamble_Dmg': {
            if (Math.random() < 0.5) {
                // ✅ تعديل: الضرر 2.0 (1500 عند لفل 1)
                const dmgAmount = Math.floor(skillPower * 2.0);
                result.damage = dmgAmount;
                result.log = `🎲 **${getName(attacker)}** نجح في المقامرة! سدد ضربة قوية بضـرر **${dmgAmount}**!`;
            } else {
                // خسارة مخففة (15% من الصحة)
                const selfDmgAmount = Math.floor(attacker.hp * 0.15);
                result.selfDamage = selfDmgAmount;
                result.log = `🎲 **${getName(attacker)}** خسر المقامرة... وانفجر النرد بوجـهه (-${selfDmgAmount})!`;
            }
            break;
        }

        case 'Buff_All': {
            const buffVal = rawValue / 100;
            result.selfEffects.push({ type: 'atk_buff', val: buffVal, turns: 3 });
            result.log = `📢 **${getName(attacker)}** أطلق صيحة الحرب! زاد هـجومـه ${rawValue}%!`;
            break;
        }

        case '%': 
        case 'TrueDMG_Burn':      // Dragon
        case 'Stun_Vulnerable':   // Elf
        case 'Confusion':         // Dark Elf
        case 'Sacrifice_Crit':    // Demon
        case 'Scale_MissingHP_Heal': // Seraphim
        case 'Execute_Heal':      // Ghoul
        case 'Chaos_RNG':         // Hybrid
        case 'Spirit_RNG':        // Spirit
        case 'Dmg_Evasion':       // New
            
            // --- المهارات العامة (Utility) ---
            if (skill.id === 'skill_shielding') {
                result.shield = skillPower;
                result.log = `🛡️ **${getName(attacker)}** رفع درعه (${result.shield})!`;
            } 
            else if (skill.id === 'skill_healing') {
                result.heal = skillPower;
                result.log = `💖 **${getName(attacker)}** استعاد ${result.heal} HP!`;
            }
            else if (skill.id === 'skill_buffing') {
                let buffPercent = rawValue / 100;
                if (buffPercent > 1.0) buffPercent = 1.0; 
                result.selfEffects.push({ type: 'atk_buff', val: buffPercent, turns: 3 });
                result.log = `💪 **${getName(attacker)}** غضب ورفع قوته بنسبة ${rawValue}%!`;
            }
            else if (skill.id === 'skill_poison') {
                result.damage = skillPower;
                const poisonVal = Math.floor(skillPower * 0.3);
                result.effectsApplied.push({ type: 'poison', val: poisonVal, turns: 3 });
                result.log = `☠️ **${getName(attacker)}** سمم خصمه!`;
            }
            else if (skill.id === 'skill_rebound') {
                const reboundVal = rawValue / 100;
                result.selfEffects.push({ type: 'rebound_active', val: reboundVal, turns: 3 });
                result.log = `🔄 **${getName(attacker)}** جهز وضعية الانعكاس (${rawValue}%)!`;
            }
            else if (skill.id === 'skill_weaken') {
                const weakenVal = rawValue / 100;
                result.effectsApplied.push({ type: 'weaken', val: weakenVal, turns: 3 });
                result.log = `📉 **${getName(attacker)}** أضعف هجوم خصمه!`;
            }
            else if (skill.id === 'skill_dispel') {
                result.effectsApplied.push({ type: 'dispel' });
                result.log = `💨 **${getName(attacker)}** بدد كل سحر الخصم!`;
            }
            else if (skill.id === 'skill_cleanse') {
                result.selfEffects.push({ type: 'cleanse' });
                result.heal = Math.floor(attacker.maxHp * 0.1);
                result.log = `✨ **${getName(attacker)}** طهر نفسه من اللعنات!`;
            }

            // --- Race Specifics Logic ---
            
            else if (skill.stat_type === 'TrueDMG_Burn') { // Dragon
                result.damage = skillPower;
                result.effectsApplied.push({ type: 'burn', val: Math.floor(skillPower * 0.2), turns: 3 });
                if (Math.random() < 0.10) { 
                    result.effectsApplied.push({ type: 'stun', val: true, turns: 1 });
                    result.log = `🐲 **${getName(attacker)}** أطلق ${skill.name} وشـل الخصم!`;
                } else {
                    result.log = `🐲 **${getName(attacker)}** أطلق ${skill.name}!`;
                }
            }
            else if (skill.stat_type === 'Stun_Vulnerable') { // Elf (Balanced)
                result.damage = Math.floor(skillPower * 0.7); 
                
                // الإضعاف مضمون
                result.effectsApplied.push({ type: 'weaken', val: 0.3, turns: 2 });
                
                // ✅ تعديل: فرصة 50% فقط للشلل
                let stunMsg = " (قاوم الشلل)";
                if (Math.random() < 0.50) {
                    result.effectsApplied.push({ type: 'stun', val: true, turns: 1 });
                    stunMsg = " 😵 وتم شل حركته!";
                }

                result.log = `🏹 **${getName(attacker)}** أطلق وابل السهام بضرر (${result.damage})${stunMsg}!`;
            }
            else if (skill.stat_type === 'Confusion') { // Dark Elf
                result.damage = Math.floor(skillPower * 0.85);
                result.effectsApplied.push({ type: 'confusion', val: true, turns: 2 });
                result.log = `🗡️ **${getName(attacker)}** سبب ضرراً وأربك الخصم!`;
            }
            else if (skill.stat_type === 'Sacrifice_Crit') { // Demon (Balanced)
                result.selfDamage = Math.floor(attacker.maxHp * 0.10);
                // ✅ الضرر 120% (بدل 180%)
                result.damage = Math.floor(skillPower * 1.2); 
                result.log = `👹 **${getName(attacker)}** ضحى بدمه لضربة مدمرة (${result.damage})!`;
            }
            else if (skill.stat_type === 'Scale_MissingHP_Heal') { // Seraphim
                const missingHpPercent = (attacker.maxHp - attacker.hp) / attacker.maxHp;
                const bonusDmg = Math.floor(skillPower * missingHpPercent * 0.8);
                result.damage = skillPower + bonusDmg;
                result.heal = Math.floor(skillPower * 0.4); 
                result.log = `⚖️ **${getName(attacker)}** عاقب بـ ${skill.name} (${result.damage})!`;
            }
            // 🔥🔥🔥 تحديث مهارة الروح 🔥🔥🔥
            else if (skill.stat_type === 'Spirit_RNG') { // Spirit
                // الضرر الأساسي (أعلى من العادي قليلاً: 1.3x)
                const spiritDmg = Math.floor(skillPower * 1.3);
                result.damage = spiritDmg;

                const roll = Math.random() * 100;
                let effectMsg = "";

                if (roll < 2) { 
                    // 2% شلل
                    result.effectsApplied.push({ type: 'stun', val: true, turns: 1 });
                    effectMsg = "😱 **لعنة الرعب!** (شلل)";
                } 
                else if (roll < 7) { 
                    // 5% عكس الضرر 100%
                    result.selfEffects.push({ type: 'rebound_active', val: 1.0, turns: 2 });
                    effectMsg = "👻 **تلبس!** (عكس الضرر 100%)";
                } 
                else if (roll < 57) { 
                    // 50% سرقة الروح
                    result.selfEffects.push({ type: 'atk_buff', val: 0.15, turns: 3 });
                    result.effectsApplied.push({ type: 'weaken', val: 0.15, turns: 3 });
                    effectMsg = "💀 **سرقة الروح!** (امتصاص القوة)";
                } 
                else {
                    effectMsg = "(هجوم طيفي)";
                }

                result.log = `👻 **${getName(attacker)}** أطلق طيفاً! سبب **${spiritDmg}** ضرر + ${effectMsg}`;
            }
            else if (skill.stat_type === 'Chaos_RNG') { // Hybrid
                const variance = (Math.random() * 0.4) + 0.8;
                result.damage = Math.floor(skillPower * variance);
                const rand = Math.random();
                let msg = "سم";
                if (rand < 0.25) { result.effectsApplied.push({ type: 'burn', val: Math.floor(skillPower * 0.2), turns: 3 }); msg="حرق"; }
                else if (rand < 0.50) { result.effectsApplied.push({ type: 'weaken', val: 0.3, turns: 2 }); msg="إضعاف"; }
                else if (rand < 0.75) { result.effectsApplied.push({ type: 'confusion', val: true, turns: 2 }); msg="ارتباك"; }
                else { result.effectsApplied.push({ type: 'poison', val: Math.floor(skillPower * 0.2), turns: 3 }); }
                result.log = `🌀 **${getName(attacker)}** أطلق فوضى (${msg})!`;
            }
            else if (skill.stat_type === 'Execute_Heal') { // Ghoul
                result.damage = skillPower;
                const poisonVal = Math.floor(skillPower * 0.3);
                result.effectsApplied.push({ type: 'poison', val: poisonVal, turns: 3 });
                
                if (defender.hp < defender.maxHp * 0.20) {
                    result.damage *= 2; 
                    result.heal = Math.floor(attacker.maxHp * 0.25);
                    result.log = `🧟 **${getName(attacker)}** شم رائحة الموت ونهش خصمه! (ضرر مضاعف)`;
                } else {
                    result.log = `🧟 **${getName(attacker)}** مزق خصمه وسبب نزيفاً!`;
                }
            }
            else if (skill.stat_type === 'Dmg_Evasion') { // New Mechanic
                const dmg = Math.floor(skillPower * 1.3);
                result.damage = dmg;
                result.selfEffects.push({ type: 'evasion', val: true, turns: 1 });
                result.log = `👻 **${getName(attacker)}** ضرب واختفى (مراوغة تامة)!`;
            }
            else {
                // Default Attack Skill
                result.damage = skillPower;
                result.log = `💥 **${getName(attacker)}** استخدم ${skill.name} وسبب ${result.damage} ضرر!`;
            }
            break;

        // --- ⚔️ Human ---
        case 'Cleanse_Buff_Shield': {
            result.selfEffects.push({ type: 'cleanse' });
            const buffPercent = rawValue / 100;
            result.selfEffects.push({ type: 'atk_buff', val: buffPercent, turns: 2 });
            const shieldAmount = Math.floor((attacker.maxHp * 0.15) + (skillPower * 0.2)); 
            result.shield = shieldAmount;
            result.log = `⚔️ **${getName(attacker)}** استخدم تكتيك القائد!`;
            break;
        }

        // --- 🩸 Vampire ---
        case 'Lifesteal_Overheal': {
            result.damage = skillPower;
            const potentialHeal = Math.floor(result.damage * 0.5);
            const missingHp = attacker.maxHp - attacker.hp;

            if (potentialHeal > missingHp) {
                result.heal = missingHp;
                result.shield = Math.floor((potentialHeal - missingHp) * 0.5);
                result.log = `🩸 **${getName(attacker)}** امتص حياة وحول الفائض لدرع!`;
            } else {
                result.heal = potentialHeal;
                result.log = `🩸 **${getName(attacker)}** امتص ${potentialHeal} HP!`;
            }
            break;
        }
        
        // --- 🛡️ Dwarf ---
        case 'Reflect_Tank': {
            const tankPower = Math.floor(attacker.maxHp * 0.2); 
            result.shield = tankPower;
            result.selfEffects.push({ type: 'rebound_active', val: 0.4, turns: 2 });
            result.log = `🛡️ **${getName(attacker)}** تحصن بالجبل!`;
            break;
        }

        default:
            result.damage = skillPower;
            result.log = `💥 **${getName(attacker)}** استخدم ${skill.name} وسبب ${result.damage} ضرر!`;
            break;
    }

    return result;
}

module.exports = { calculateSkillRawValue, executeSkill };
