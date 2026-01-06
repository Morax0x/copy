// ================================================================
// 🔥 COMBAT ENGINE: Skill Calculator (Independent System)
// نظام مهارات مستقل لا يعتمد على ضرر السلاح
// ================================================================

// ⚖️ مضاعف الموازنة العام
// هذا الرقم يضرب قيم الجيسون الخام لجعلها مؤثرة في القتال
// القيمة 5 تجعل مهارة قيمتها 100 تسبب 500 ضرر
const GLOBAL_SKILL_MULTIPLIER = 5.0;

/**
 * حساب القيمة الخام للمهارة من ملف الإعدادات
 */
function calculateSkillRawValue(skillConfig, currentLevel) {
    if (!skillConfig) return 0;
    const level = Math.max(1, currentLevel || 1);
    // المعادلة من الجيسون: Base + (Increment * (Level - 1))
    return skillConfig.base_value + (skillConfig.value_increment * (level - 1));
}

/**
 * تنفيذ المهارة وحساب نتائجها
 * @param {Object} attacker - اللاعب المهاجم
 * @param {Object} defender - اللاعب المدافع
 * @param {Object} skill - بيانات المهارة
 * @param {boolean} isOwner - هل هو الأونر (للتجربة)
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
    
    // 1️⃣ حساب قوة المهارة الأساسية من الجيسون (بدون سلاح)
    const rawValue = calculateSkillRawValue(skill, skill.currentLevel);
    
    // 2️⃣ تحويل القيمة إلى ضرر فعلي باستخدام المضاعف العام
    // مثال: تنين لفل 1 (50) * 5 = 250 ضرر
    let skillPower = Math.floor(rawValue * GLOBAL_SKILL_MULTIPLIER);

    // تطبيق البفات الخاصة باللاعب (Buffs) على قوة المهارة
    if (attacker.effects && attacker.effects.buff > 0) skillPower *= (1 + attacker.effects.buff);
    if (attacker.effects && attacker.effects.weaken > 0) skillPower *= (1 - attacker.effects.weaken);
    
    skillPower = Math.floor(skillPower * multiplier);

    // ====================================================
    // 🔮 منطق المهارات (Stat Types)
    // ====================================================

    switch (skill.stat_type) {
        
        // --- 🐲 Dragon: TrueDMG_Burn ---
        case 'TrueDMG_Burn': {
            // ضرر حقيقي مباشر
            result.damage = skillPower;
            
            // حرق يعتمد على قوة المهارة (20%)
            const burnVal = Math.floor(skillPower * 0.2);
            result.effectsApplied.push({ type: 'burn', val: burnVal, turns: 3 });

            let extraMsg = "";
            // فرصة شلل نادرة (5%)
            if (Math.random() < 0.05) {
                result.effectsApplied.push({ type: 'stun', val: true, turns: 1 });
                extraMsg = " 🥶 وتجمد من الرعب!";
            }
            
            result.log = `🐲 **${getName(attacker)}** أطلق جحيم التنين! (${result.damage} ضرر حقيقي).${extraMsg}`;
            break;
        }

        // --- ⚔️ Human: Cleanse_Buff_Shield ---
        case 'Cleanse_Buff_Shield': {
            result.selfEffects.push({ type: 'cleanse' });
            
            // البف يعتمد على النسبة في الجيسون (مثلاً 15% إلى 50%)
            // هنا نستخدم rawValue مباشرة كنسبة مئوية
            const buffPercent = rawValue / 100;
            result.selfEffects.push({ type: 'buff', val: buffPercent, turns: 2 });

            // الدرع: يعتمد على صحة اللاعب + قوة المهارة
            // مثال: 10% من الصحة + (قوة المهارة * 2)
            const shieldAmount = Math.floor((attacker.maxHp * 0.10) + (skillPower * 0.5));
            result.shield = shieldAmount;

            result.log = `⚔️ **${getName(attacker)}** استخدم تكتيك القائد! (تطهير + هجوم + درع)`;
            break;
        }

        // --- ⚖️ Seraphim: Scale_MissingHP_Heal ---
        case 'Scale_MissingHP_Heal': {
            const missingHpPercent = (attacker.maxHp - attacker.hp) / attacker.maxHp;
            // الضرر يزيد كلما قلت الصحة (עד 50% زيادة)
            const bonusDmg = Math.floor(skillPower * missingHpPercent * 0.5);
            result.damage = skillPower + bonusDmg;
            
            // شفاء ثابت بناءً على قوة المهارة
            result.heal = Math.floor(skillPower * 0.4); // 40% من قوة الضربة شفاء
            
            result.log = `⚖️ **${getName(attacker)}** عاقب بضرر مقدس (${result.damage}) وشفى نفسه!`;
            break;
        }

        // --- 👹 Demon: Sacrifice_Crit ---
        case 'Sacrifice_Crit': {
            // تضحية بالدم
            result.selfDamage = Math.floor(attacker.maxHp * 0.10);
            
            // ضرر عالي جداً (1.5x من قوة المهارة)
            result.damage = Math.floor(skillPower * 1.5);
            
            result.log = `👹 **${getName(attacker)}** ضحى بدمه لتوجيه ضربة مدمرة (${result.damage})!`;
            break;
        }

        // --- 🍃 Elf: Stun_Vulnerable ---
        case 'Stun_Vulnerable': {
            // ضرر أقل (70% من القوة) مقابل التحكم
            result.damage = Math.floor(skillPower * 0.7);
            
            result.effectsApplied.push({ type: 'stun', val: true, turns: 1 });
            result.effectsApplied.push({ type: 'weaken', val: 0.3, turns: 2 });

            result.log = `🍃 **${getName(attacker)}** أطلق سهاماً شلت حركة الخصم!`;
            break;
        }

        // --- 🗡️ Dark Elf: Confusion ---
        case 'Confusion': {
            // ضرر متوسط (85%)
            result.damage = Math.floor(skillPower * 0.85);
            result.effectsApplied.push({ type: 'confusion', val: true, turns: 2 });
            
            result.log = `😵 **${getName(attacker)}** ضرب وأربك عقل الخصم!`;
            break;
        }

        // --- 🦇 Vampire: Lifesteal_Overheal ---
        case 'Lifesteal_Overheal': {
            // ضرر كامل
            result.damage = skillPower;
            
            // شفاء 50% من الضرر
            const potentialHeal = Math.floor(result.damage * 0.5);
            const missingHp = attacker.maxHp - attacker.hp;

            if (potentialHeal > missingHp) {
                result.heal = missingHp;
                // الفائض يتحول لدرع
                result.shield = Math.floor((potentialHeal - missingHp) * 0.5);
                result.log = `🍷 **${getName(attacker)}** امتص الحياة وحول الفائض لدرع!`;
            } else {
                result.heal = potentialHeal;
                result.log = `🍷 **${getName(attacker)}** امتص ${potentialHeal} HP!`;
            }
            break;
        }

        // --- 🌀 Hybrid: Chaos_RNG ---
        case 'Chaos_RNG': {
            result.damage = Math.floor(skillPower * 0.9);
            
            const rand = Math.random();
            let effectMsg = "";
            if (rand < 0.25) {
                result.effectsApplied.push({ type: 'burn', val: Math.floor(skillPower * 0.2), turns: 3 });
                effectMsg = "حرق";
            } else if (rand < 0.50) {
                result.effectsApplied.push({ type: 'weaken', val: 0.3, turns: 2 });
                effectMsg = "إضعاف";
            } else if (rand < 0.75) {
                result.effectsApplied.push({ type: 'confusion', val: true, turns: 2 });
                effectMsg = "ارتباك";
            } else {
                result.effectsApplied.push({ type: 'poison', val: Math.floor(skillPower * 0.2), turns: 3 });
                effectMsg = "سم";
            }
            result.log = `🌀 **${getName(attacker)}** سبب فوضى (${effectMsg})!`;
            break;
        }

        // --- 👻 Spirit: Dmg_Evasion ---
        case 'Dmg_Evasion': {
            result.damage = Math.floor(skillPower * 0.8); // ضرر مخفض
            result.selfEffects.push({ type: 'evasion', val: 1, turns: 1 });
            result.log = `👻 **${getName(attacker)}** ضرب واختفى (مراوغة تامة)!`;
            break;
        }

        // --- 🛡️ Dwarf: Reflect_Tank ---
        case 'Reflect_Tank': {
            // القيمة هنا تستخدم كنسبة لتقليل الضرر وكمية الدرع
            // الدرع = قوة المهارة * 1.5
            result.shield = Math.floor(skillPower * 1.5);
            result.selfEffects.push({ type: 'rebound_active', val: 0.4, turns: 2 });
            result.log = `🔨 **${getName(attacker)}** تحصن بالجبل (دفاع وعكس ضرر)!`;
            break;
        }

        // --- 🧟 Ghoul: Execute_Heal ---
        case 'Execute_Heal': {
            // ضرر قوي (1.2x)
            const calcDamage = Math.floor(skillPower * 1.2);
            
            if (defender.hp - calcDamage <= 0) {
                result.damage = defender.hp; // قتل
                result.heal = Math.floor(attacker.maxHp * 0.25);
                result.log = `🥩 **${getName(attacker)}** افترس خصمه واستعاد صحته!`;
            } else {
                result.damage = calcDamage;
                result.log = `🧟 **${getName(attacker)}** نهش خصمه بضرر وحشي!`;
            }
            break;
        }

        // --- 🎲 RNG: Gamble ---
        case 'RNG': {
            // يعتمد على الحظ بشكل كامل
            if (Math.random() < 0.5) {
                // نجاح: 3 أضعاف القوة
                result.damage = skillPower * 3;
                result.log = `🎲 **${getName(attacker)}** ربح الرهان! ضربة ساحقة (${result.damage})!`;
            } else {
                // فشل: نصف القوة + ضرر ذاتي
                result.damage = Math.floor(skillPower * 0.5);
                result.selfDamage = Math.floor(attacker.maxHp * 0.1);
                result.log = `🎲 **${getName(attacker)}** خسر الرهان وتلقى ضرراً!`;
            }
            break;
        }

        // --- 🛡️ المهارات العامة (%) ---
        case '%': 
            if (skill.id === 'skill_shielding') {
                // الدرع = قيمة المهارة الأساسية * 5 (نفس المضاعف)
                result.shield = skillPower;
                result.log = `🛡️ **${getName(attacker)}** رفع درعه (${result.shield})!`;
            } 
            else if (skill.id === 'skill_healing') {
                result.heal = skillPower;
                result.log = `💖 **${getName(attacker)}** استعاد ${result.heal} HP!`;
            }
            else if (skill.id === 'skill_buffing') {
                // تحويل القيمة لنسبة مئوية (مثلاً 500 قوة = 50% بف)
                // نقسم على 1000 لجعل البف منطقي (0.5)
                const buffVal = Math.min(0.5, skillPower / 1000); 
                result.selfEffects.push({ type: 'buff', val: 0.25, turns: 3 }); // قيمة ثابتة 25% للبف العام لتجنب الكسر
                result.log = `💪 **${getName(attacker)}** رفع قوته!`;
            }
            else if (skill.id === 'skill_poison') {
                result.damage = Math.floor(skillPower * 0.5);
                const poisonVal = Math.floor(skillPower * 0.3);
                result.effectsApplied.push({ type: 'poison', val: poisonVal, turns: 3 });
                result.log = `☠️ **${getName(attacker)}** سمم خصمه!`;
            }
            else if (skill.id === 'skill_dispel') {
                result.effectsApplied.push({ type: 'dispel' });
                result.log = `💨 **${getName(attacker)}** بدد كل سحر الخصم!`;
            }
            else if (skill.id === 'skill_cleanse') {
                result.selfEffects.push({ type: 'cleanse' });
                result.heal = Math.floor(attacker.maxHp * 0.1);
                result.log = `✨ **${getName(attacker)}** طهر نفسه!`;
            }
            else {
                // مهارات هجومية عامة
                result.damage = skillPower;
                result.log = `💥 **${getName(attacker)}** استخدم ${skill.name} وسبب ${result.damage} ضرر!`;
            }
            break;

        default:
            result.log = `⚠️ مهارة غير معروفة: ${skill.name}`;
            break;
    }

    return result;
}

function getName(entity) {
    if (entity.isMonster) return entity.name;
    if (entity.member) return entity.member.displayName;
    return entity.name || "Unknown";
}

module.exports = { calculateSkillRawValue, executeSkill };
