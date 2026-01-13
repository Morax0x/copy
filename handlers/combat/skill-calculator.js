// ================================================================
// 🔥 COMBAT ENGINE: Skill Calculator (Fixed & Complete)
// المحرك المسؤول عن حساب أرقام وتأثيرات المهارات
// ================================================================

const { cleanDisplayName } = require('../dungeon/utils');

// القيمة 5.0 تعني أن مهارة بقوة 100 تسبب 500 ضرر (للمهارات التي تعتمد على اللفل)
const GLOBAL_SKILL_MULTIPLIER = 5.0;

/**
 * حساب القوة الخام للمهارة بناءً على مستواها
 */
function calculateSkillRawValue(skillConfig, currentLevel) {
    if (!skillConfig) return 0;
    const level = Math.max(1, currentLevel || 1);
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
    
    // 1. حساب قوة المهارة الأساسية (النسبة المئوية أو الرقم الثابت)
    const rawValue = calculateSkillRawValue(skill, skill.currentLevel);
    
    // 2. تحديد القوة النهائية (Skill Power) بناءً على نوع الإحصائية
    let skillPower = 0;

    if (skill.stat_type === '%') {
        // 🔥🔥 تصحيح جوهري: التمييز بين الشفاء/الدرع والهجوم 🔥🔥
        // إذا كانت مهارة شفاء أو درع، نحسبها من الـ HP (للاستفادة من جرعة العملاق)
        if (skill.id.includes('heal') || skill.id.includes('shield')) {
            skillPower = Math.floor(attacker.maxHp * (rawValue / 100));
        } else {
            // إذا كانت مهارة هجومية أو بف، نحسبها من الـ ATK
            skillPower = Math.floor(attacker.atk * (rawValue / 100) * GLOBAL_SKILL_MULTIPLIER);
        }
    } else {
        // مهارات الكلاسات والأعراق (تعتمد على الرقم الخام × المضاعف العام)
        skillPower = Math.floor(rawValue * GLOBAL_SKILL_MULTIPLIER);
    }

    // =========================================================
    // 🔥 3. تطبيق البفات على قوة المهارة (تم التعديل لدعم المصفوفات) 🔥
    // =========================================================
    // لا نطبق البفات على الشفاء والدروع هنا لأنها حُسبت من الـ HP مباشرة
    if (!skill.id.includes('heal') && !skill.id.includes('shield')) {
        let buffMultiplier = 1.0;

        // أ. دعم النظام القديم (Object) - للأمان والتوافق
        if (attacker.effects && !Array.isArray(attacker.effects)) {
             if (attacker.effects.buff > 0) buffMultiplier += attacker.effects.buff;
             if (attacker.effects.weaken > 0) buffMultiplier -= attacker.effects.weaken;
        }

        // ب. دعم النظام الجديد (Array - Dungeon) ✅✅✅
        // هذا هو الجزء الذي كان ناقصاً
        if (attacker.effects && Array.isArray(attacker.effects)) {
            attacker.effects.forEach(e => {
                // نجمع كل البفات من نوع atk_buff أو buff
                if (e.type === 'atk_buff' || e.type === 'buff') {
                    buffMultiplier += e.val;
                }
                // نطرح الضعف
                if (e.type === 'weaken') {
                    buffMultiplier -= e.val;
                }
            });
        }
        
        // تطبيق النتيجة النهائية للمضاعف
        // مثلاً لو عنده بف 50%، الملتيبلاير يصبح 1.5
        skillPower = Math.floor(skillPower * buffMultiplier);
    }
    
    skillPower = Math.floor(skillPower * multiplier);

    // ====================================================
    // 🔮 منطق المهارات (Stat Types Logic)
    // ====================================================

    switch (skill.stat_type) {
        
        // --- 🎲 المقامرة (جديد) ---
        case 'Gamble_Dmg': {
            if (Math.random() < 0.5) {
                const dmgAmount = Math.floor(attacker.atk * 3.0);
                result.damage = dmgAmount;
                result.log = `🎲 **${getName(attacker)}** نجح في المقامرة! سدد ضربة ساحقة بضرر **${dmgAmount}**!`;
            } else {
                const selfDmgAmount = Math.floor(attacker.hp * 0.5);
                result.selfDamage = selfDmgAmount;
                result.log = `🎲 **${getName(attacker)}** خسر المقامرة... ودفع الثمن من دمه (-${selfDmgAmount})!`;
            }
            break;
        }

        // --- 📢 صيحة الحرب (جديد) ---
        case 'Buff_All': {
            const buffVal = rawValue / 100;
            result.selfEffects.push({ type: 'atk_buff', val: buffVal, turns: 3 });
            result.log = `📢 **${getName(attacker)}** أطلق صيحة الحرب! زاد هجوم الفريق بنسبة ${rawValue}%!`;
            break;
        }

        // --- 🛡️ المهارات العامة (%) ---
        case '%': 
            if (skill.id === 'skill_shielding') {
                result.shield = skillPower;
                result.log = `🛡️ **${getName(attacker)}** رفع درعه (${result.shield})!`;
            } 
            else if (skill.id === 'skill_healing') {
                result.heal = skillPower;
                result.log = `💖 **${getName(attacker)}** استعاد ${result.heal} HP!`;
            }
            else if (skill.id === 'skill_buffing') {
                // هنا النسبة هي rawValue مباشرة (لأنها بف)
                let buffPercent = rawValue / 100;
                if (buffPercent > 1.0) buffPercent = 1.0; 
                result.selfEffects.push({ type: 'atk_buff', val: buffPercent, turns: 3 });
                result.log = `💪 **${getName(attacker)}** غضب ورفع قوته بنسبة ${rawValue}%!`;
            }
            else if (skill.id === 'skill_poison') {
                result.damage = Math.floor(skillPower * 0.5);
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
            else {
                result.damage = skillPower;
                result.log = `💥 **${getName(attacker)}** استخدم ${skill.name} وسبب ${result.damage} ضرر!`;
            }
            break;

        // --- 🐲 Dragon (تنين) ---
        case 'TrueDMG_Burn': {
            result.damage = skillPower;
            const burnVal = Math.floor(skillPower * 0.2);
            result.effectsApplied.push({ type: 'burn', val: burnVal, turns: 3 });
            
            let extraMsg = "";
            if (Math.random() < 0.10) { 
                result.effectsApplied.push({ type: 'stun', val: true, turns: 1 });
                extraMsg = " 🥶 وتجمد من الرعب!";
            }
            result.log = `🐲 **${getName(attacker)}** أطلق ${skill.name}! (${result.damage} ضرر).${extraMsg}`;
            break;
        }

        // --- ⚔️ Human (بشري) ---
        case 'Cleanse_Buff_Shield': {
            result.selfEffects.push({ type: 'cleanse' });
            const buffPercent = rawValue / 100;
            result.selfEffects.push({ type: 'atk_buff', val: buffPercent, turns: 2 });
            const shieldAmount = Math.floor((attacker.maxHp * 0.10) + (skillPower * 0.5));
            result.shield = shieldAmount;
            result.log = `⚔️ **${getName(attacker)}** استخدم تكتيك القائد! (تطهير + هجوم + درع)`;
            break;
        }

        // --- ⚖️ Seraphim (ملاك) ---
        case 'Scale_MissingHP_Heal': {
            const missingHpPercent = (attacker.maxHp - attacker.hp) / attacker.maxHp;
            const bonusDmg = Math.floor(skillPower * missingHpPercent * 0.8);
            result.damage = skillPower + bonusDmg;
            result.heal = Math.floor(skillPower * 0.4); 
            result.log = `⚖️ **${getName(attacker)}** عاقب بـ ${skill.name} (${result.damage}) وشفى نفسه!`;
            break;
        }

        // --- 👹 Demon (شيطان) ---
        case 'Sacrifice_Crit': {
            result.selfDamage = Math.floor(attacker.maxHp * 0.10);
            result.damage = Math.floor(skillPower * 1.8); 
            result.log = `👹 **${getName(attacker)}** ضحى بدمه لتوجيه ضربة مدمرة (${result.damage})!`;
            break;
        }

        // --- 🏹 Elf (إلف) ---
        case 'Stun_Vulnerable': {
            result.damage = Math.floor(skillPower * 0.7); 
            result.effectsApplied.push({ type: 'stun', val: true, turns: 1 });
            result.effectsApplied.push({ type: 'weaken', val: 0.3, turns: 2 });
            result.log = `🏹 **${getName(attacker)}** شل حركة الخصم وجعله هشاً!`;
            break;
        }

        // --- 🗡️ Dark Elf (إلف الظلام) ---
        case 'Confusion': {
            result.damage = Math.floor(skillPower * 0.85);
            result.effectsApplied.push({ type: 'confusion', val: true, turns: 2 });
            result.log = `🗡️ **${getName(attacker)}** أربك عقل الخصم!`;
            break;
        }

        // --- 🩸 Vampire (مصاص دماء) ---
        case 'Lifesteal_Overheal': {
            result.damage = skillPower;
            const potentialHeal = Math.floor(result.damage * 0.5);
            const missingHp = attacker.maxHp - attacker.hp;

            if (potentialHeal > missingHp) {
                result.heal = missingHp;
                result.shield = Math.floor((potentialHeal - missingHp) * 0.5);
                result.log = `🩸 **${getName(attacker)}** امتص حياة خصمه وحول الفائض لدرع!`;
            } else {
                result.heal = potentialHeal;
                result.log = `🩸 **${getName(attacker)}** امتص ${potentialHeal} HP!`;
            }
            break;
        }

        // --- 🌀 Hybrid (هجين) ---
        case 'Chaos_RNG': {
            // تباين عشوائي للضرر (0.8 إلى 1.2)
            const variance = (Math.random() * 0.4) + 0.8;
            result.damage = Math.floor(skillPower * variance);
            
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
            result.log = `🌀 **${getName(attacker)}** أطلق فوضى (${result.damage} ضرر + ${effectMsg})!`;
            break;
        }

        // --- 👻 Spirit (روح) ---
        case 'Dmg_Blind': {
            result.damage = skillPower;
            // عمى بنسبة 50% للخصم
            result.effectsApplied.push({ type: 'blind', val: 0.5, turns: 2 }); 
            result.log = `👻 **${getName(attacker)}** أصاب خصمه بالعمى!`;
            break;
        }
        
        // --- 🛡️ Dwarf (قزم) ---
        case 'Reflect_Tank': {
            result.shield = Math.floor(skillPower * 1.5);
            result.selfEffects.push({ type: 'rebound_active', val: 0.4, turns: 2 });
            result.log = `🛡️ **${getName(attacker)}** تحصن بالجبل (دفاع وعكس ضرر)!`;
            break;
        }

        // --- 🧟 Ghoul (غول) ---
        case 'Execute_Heal': {
            result.damage = skillPower;
            const bleedDmg = Math.floor(skillPower * 0.15);
            result.effectsApplied.push({ type: 'poison', val: bleedDmg, turns: 3 });

            // إذا كان دم الخصم أقل من 20%، الضربة تصبح حرجة جداً وتشفي الغول
            if (defender.hp < defender.maxHp * 0.20) {
                result.damage = Math.floor(result.damage * 2.0); // ضرر مضاعف
                result.heal = Math.floor(attacker.maxHp * 0.25);
                result.log = `🧟 **${getName(attacker)}** شم رائحة الموت ونهش خصمه بوحشية! (ضرر قاتل + شفاء)`;
            } else {
                result.log = `🧟 **${getName(attacker)}** مزق خصمه وسبب نزيفاً!`;
            }
            break;
        }

        // أي مهارة غير معرفة
        default:
            result.damage = skillPower;
            result.log = `💥 **${getName(attacker)}** استخدم ${skill.name} وسبب ${result.damage} ضرر!`;
            break;
    }

    return result;
}

module.exports = { calculateSkillRawValue, executeSkill };
