// ================================================================
// 🔥 COMBAT ENGINE: Skill Calculator
// المسؤول عن حساب تأثيرات المهارات (ضرر، شفاء، دروع، حالات)
// ================================================================

/**
 * دالة لحساب قوة المهارة (Value) بناءً على مستواها الحالي
 * @param {Object} skillConfig - إعدادات المهارة من JSON
 * @param {number} currentLevel - المستوى الحالي للمهارة
 */
function calculateSkillValue(skillConfig, currentLevel) {
    if (!skillConfig) return 0;
    const level = Math.max(1, currentLevel || 1);
    // القيمة = الأساس + (الزيادة * (المستوى - 1))
    return skillConfig.base_value + (skillConfig.value_increment * (level - 1));
}

/**
 * الدالة الرئيسية لتنفيذ المهارة
 * @param {Object} attacker - الكائن المهاجم (لاعب أو وحش)
 * @param {Object} defender - الكائن المدافع
 * @param {Object} skill - بيانات المهارة المستخدمة
 * @param {boolean} isOwner - هل المستخدم هو الأونر (للمضاعفات الخاصة)
 */
function executeSkill(attacker, defender, skill, isOwner = false) {
    const result = {
        damage: 0,
        heal: 0,
        shield: 0,
        selfDamage: 0,
        effectsApplied: [], // قائمة بالتأثيرات التي تم تطبيقها على الخصم
        selfEffects: [],    // قائمة بالتأثيرات التي تم تطبيقها على النفس
        log: ""             // رسالة السجل
    };

    // 1. حساب القوة الأساسية
    // مضاعف الأونر (x10)
    const multiplier = isOwner ? 10 : 1;
    
    // القيمة المحسوبة من الليفل (النسبة المئوية أو الرقم الثابت)
    const skillValue = calculateSkillValue(skill, skill.currentLevel); 
    
    // هجوم اللاعب الفعلي (مع البفات)
    let effectiveAtk = attacker.weapon ? attacker.weapon.currentDamage : 15; // سلاح افتراضي
    if (attacker.atk) effectiveAtk = attacker.atk; // إذا كان وحش أو عنده قيمة atk مباشرة

    // تطبيق البفات على الهجوم
    if (attacker.effects && attacker.effects.buff > 0) effectiveAtk *= (1 + attacker.effects.buff);
    if (attacker.effects && attacker.effects.weaken > 0) effectiveAtk *= (1 - attacker.effects.weaken);
    
    effectiveAtk = Math.floor(effectiveAtk);

    // ====================================================
    // ⚙️ منطق المهارات (Skill Logic)
    // ====================================================

    switch (skill.stat_type) {
        
        // --- 🐲 Dragon: TrueDMG_Burn ---
        case 'TrueDMG_Burn': {
            // ضرر: 80% من الهجوم + نسبة المهارة (موزون)
            const dmgRatio = 0.8 + (skillValue / 100);
            result.damage = Math.floor(effectiveAtk * dmgRatio) * multiplier;
            
            // حرق: 20% من الهجوم
            const burnDmg = Math.floor(effectiveAtk * 0.2) * multiplier;
            result.effectsApplied.push({ type: 'burn', val: burnDmg, turns: 3 });

            let extraMsg = "";
            // شلل نادر (5%)
            if (Math.random() < 0.05) {
                result.effectsApplied.push({ type: 'stun', val: true, turns: 1 });
                extraMsg = " 🥶 ارتعد الخصم وتجمد!";
            }
            
            result.log = `🐲 **${getName(attacker)}** أطلق جحيم التنين! (${result.damage} ضرر حقيقي + حرق).${extraMsg}`;
            break;
        }

        // --- ⚔️ Human: Cleanse_Buff_Shield ---
        case 'Cleanse_Buff_Shield': {
            // تطهير النفس
            result.selfEffects.push({ type: 'cleanse' });
            // بف هجوم 20%
            result.selfEffects.push({ type: 'buff', val: 0.2, turns: 2 });

            // حساب الدرع (يعتمد على ليفل المهارة بشكل رئيسي)
            // الدرع = (15% من الصحة + 2% لكل ليفل) + (15 * ليفل المهارة)
            const lvl = skill.currentLevel || 1;
            const hpPercent = 0.15 + ((lvl - 1) * 0.02);
            const flatBonus = lvl * 15;
            
            result.shield = Math.floor((attacker.maxHp * hpPercent) + flatBonus) * multiplier;

            // التحقق من وجود درع مسبق يتم خارج هذه الدالة (في المعالج الرئيسي)
            result.log = `⚔️ **${getName(attacker)}** استخدم تكتيك القائد! (تطهير + هجوم + درع)`;
            break;
        }

        // --- ⚖️ Seraphim: Scale_MissingHP_Heal ---
        case 'Scale_MissingHP_Heal': {
            const missingHpPercent = (attacker.maxHp - attacker.hp) / attacker.maxHp;
            // ضرر إضافي بناءً على الصحة المفقودة
            const extraDmg = Math.floor(effectiveAtk * missingHpPercent * 1.5);
            // الضرر الأساسي مخفض قليلاً (0.7) لتعويض البونص
            result.damage = Math.floor((effectiveAtk * 0.7) + extraDmg) * multiplier;
            
            // شفاء ذاتي
            result.heal = Math.floor(attacker.maxHp * 0.15) * multiplier;
            
            result.log = `⚖️ **${getName(attacker)}** عاقب خصمه بضرر متصاعد (${result.damage}) وشفى نفسه!`;
            break;
        }

        // --- 👹 Demon: Sacrifice_Crit ---
        case 'Sacrifice_Crit': {
            // تضحية بـ 10% من الصحة
            result.selfDamage = Math.floor(attacker.maxHp * 0.10);
            
            // ضرر ضخم (150% + نسبة المهارة)
            const dmgRatio = 1.5 + (skillValue / 100);
            result.damage = Math.floor(effectiveAtk * dmgRatio) * multiplier;
            
            result.log = `👹 **${getName(attacker)}** ضحى بدمه لتوجيه ضربة مدمرة (${result.damage})!`;
            break;
        }

        // --- 🍃 Elf: Stun_Vulnerable ---
        case 'Stun_Vulnerable': {
            // ضرر متوسط (60% + نسبة المهارة)
            const dmgRatio = 0.6 + (skillValue / 100);
            result.damage = Math.floor(effectiveAtk * dmgRatio) * multiplier;
            
            // تأثيرات الحالة
            result.effectsApplied.push({ type: 'stun', val: true, turns: 1 });
            result.effectsApplied.push({ type: 'weaken', val: 0.5, turns: 2 }); // إضعاف قوي 50%

            result.log = `🍃 **${getName(attacker)}** شل حركة الخصم وجعله هشاً!`;
            break;
        }

        // --- 🗡️ Dark Elf: Confusion ---
        case 'Confusion': {
            const dmgRatio = 0.7 + (skillValue / 100);
            result.damage = Math.floor(effectiveAtk * dmgRatio) * multiplier;
            
            // ارتباك (25% يضرب نفسه)
            result.effectsApplied.push({ type: 'confusion', val: true, turns: 2 });
            
            result.log = `😵 **${getName(attacker)}** أربك خصمه بلعنة الجنون!`;
            break;
        }

        // --- 🦇 Vampire: Lifesteal_Overheal ---
        case 'Lifesteal_Overheal': {
            const dmgRatio = 0.8 + (skillValue / 100);
            result.damage = Math.floor(effectiveAtk * dmgRatio) * multiplier;
            
            // شفاء بنسبة 50% من الضرر
            const healAmount = Math.floor(result.damage * 0.5);
            const currentMissingHp = attacker.maxHp - attacker.hp;

            if (healAmount > currentMissingHp) {
                // الشفاء الفائض يتحول لدرع (بنسبة 50%)
                result.heal = currentMissingHp;
                result.shield = Math.floor((healAmount - currentMissingHp) * 0.5);
                result.log = `🍷 **${getName(attacker)}** امتص الحياة وحول الفائض لدرع!`;
            } else {
                result.heal = healAmount;
                result.log = `🍷 **${getName(attacker)}** امتص ${healAmount} HP من خصمه!`;
            }
            break;
        }

        // --- 🌀 Hybrid: Chaos_RNG ---
        case 'Chaos_RNG': {
            const dmgRatio = 0.75 + (skillValue / 100);
            result.damage = Math.floor(effectiveAtk * dmgRatio) * multiplier;
            
            const rand = Math.random();
            let effectMsg = "";
            if (rand < 0.25) {
                result.effectsApplied.push({ type: 'burn', val: Math.floor(effectiveAtk * 0.2), turns: 3 });
                effectMsg = "حرق";
            } else if (rand < 0.50) {
                result.effectsApplied.push({ type: 'weaken', val: 0.3, turns: 2 });
                effectMsg = "إضعاف";
            } else if (rand < 0.75) {
                result.effectsApplied.push({ type: 'confusion', val: true, turns: 2 });
                effectMsg = "ارتباك";
            } else {
                result.effectsApplied.push({ type: 'poison', val: Math.floor(effectiveAtk * 0.15), turns: 3 });
                effectMsg = "سم";
            }
            result.log = `🌀 **${getName(attacker)}** سبب فوضى (${effectMsg})!`;
            break;
        }

        // --- 👻 Spirit: Dmg_Evasion ---
        case 'Dmg_Evasion': {
            const dmgRatio = 0.8 + (skillValue / 100);
            result.damage = Math.floor(effectiveAtk * dmgRatio) * multiplier;
            
            result.selfEffects.push({ type: 'evasion', val: 1, turns: 1 });
            result.log = `👻 **${getName(attacker)}** ضرب واختفى (مراوغة تامة)!`;
            break;
        }

        // --- 🛡️ Dwarf: Reflect_Tank ---
        case 'Reflect_Tank': {
            // درع 20% من الصحة
            result.shield = Math.floor(attacker.maxHp * 0.2) * multiplier;
            // عكس الضرر 40%
            result.selfEffects.push({ type: 'rebound_active', val: 0.4, turns: 2 });
            
            result.log = `🔨 **${getName(attacker)}** تحصن بالجبل (دفاع وعكس ضرر)!`;
            break;
        }

        // --- 🧟 Ghoul: Execute_Heal ---
        case 'Execute_Heal': {
            const dmgRatio = 1.0 + (skillValue / 100);
            const calculatedDmg = Math.floor(effectiveAtk * dmgRatio) * multiplier;
            
            // فحص إذا الضربة تقتل (Execute)
            if (defender.hp - calculatedDmg <= 0) {
                result.damage = defender.hp; // قتل فوري
                result.heal = Math.floor(attacker.maxHp * 0.25);
                result.log = `🥩 **${getName(attacker)}** افترس خصمه واستعاد صحته!`;
            } else {
                result.damage = calculatedDmg;
                result.log = `🧟 **${getName(attacker)}** نهش خصمه بضرر وحشي!`;
            }
            break;
        }

        // --- 🎲 RNG: Gamble ---
        case 'RNG': {
            const isSuccess = Math.random() < 0.5;
            if (isSuccess) {
                // ضربة حرجة (250% هجوم)
                result.damage = Math.floor(effectiveAtk * 2.5) * multiplier;
                result.log = `🎲 **${getName(attacker)}** ربح الرهان! ضربة ساحقة (${result.damage})!`;
            } else {
                // فشل (50% هجوم + ضرر ذاتي)
                result.damage = Math.floor(effectiveAtk * 0.5) * multiplier;
                result.selfDamage = Math.floor(attacker.maxHp * 0.1);
                result.log = `🎲 **${getName(attacker)}** خسر الرهان وتلقى ضرراً!`;
            }
            break;
        }

        // --- 🛡️ Skill: Shielding (العادية) ---
        case '%': // للمهارات العامة التي تعتمد على النسبة
            if (skill.id === 'skill_shielding') {
                const lvl = skill.currentLevel || 1;
                const hpPercent = 0.15 + ((lvl - 1) * 0.02);
                const flatBonus = lvl * 15;
                result.shield = Math.floor((attacker.maxHp * hpPercent) + flatBonus) * multiplier;
                result.log = `🛡️ **${getName(attacker)}** اكتسب درعاً!`;
            } 
            else if (skill.id === 'skill_healing') {
                const healPercent = skillValue / 100;
                result.heal = Math.floor(attacker.maxHp * healPercent) * multiplier;
                result.log = `💖 **${getName(attacker)}** استعاد ${result.heal} HP!`;
            }
            else if (skill.id === 'skill_buffing') {
                const buffVal = skillValue / 100;
                result.selfEffects.push({ type: 'buff', val: buffVal, turns: 3 });
                result.log = `💪 **${getName(attacker)}** رفع قوته!`;
            }
            else if (skill.id === 'skill_poison') {
                const dmgRatio = 0.5; // نصف الهجوم كضرر فوري
                result.damage = Math.floor(effectiveAtk * dmgRatio) * multiplier;
                const poisonVal = Math.floor(effectiveAtk * (skillValue / 100)) * multiplier;
                result.effectsApplied.push({ type: 'poison', val: poisonVal, turns: 3 });
                result.log = `☠️ **${getName(attacker)}** سمم خصمه!`;
            }
            else if (skill.id === 'skill_cleanse') {
                result.selfEffects.push({ type: 'cleanse' });
                // شفاء بسيط 10%
                result.heal = Math.floor(attacker.maxHp * 0.10) * multiplier;
                result.log = `✨ **${getName(attacker)}** طهر نفسه من اللعنات!`;
            }
            else if (skill.id === 'skill_dispel') {
                result.effectsApplied.push({ type: 'dispel' }); // تأثير خاص يمسح بفات الخصم
                result.log = `💨 **${getName(attacker)}** بدد كل سحر الخصم!`;
            }
            else {
                // مهارات هجومية عامة
                const dmgRatio = 0.8 + (skillValue / 100);
                result.damage = Math.floor(effectiveAtk * dmgRatio) * multiplier;
                result.log = `💥 **${getName(attacker)}** استخدم ${skill.name} وسبب ${result.damage} ضرر!`;
            }
            break;

        default:
            result.log = `⚠️ مهارة غير معروفة: ${skill.name}`;
            break;
    }

    return result;
}

// دالة مساعدة لجلب الاسم
function getName(entity) {
    if (entity.isMonster) return entity.name;
    if (entity.member) return entity.member.displayName;
    return entity.name || "Unknown";
}

module.exports = { calculateSkillValue, executeSkill };
