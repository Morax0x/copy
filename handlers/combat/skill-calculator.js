// ================================================================
// 🔥 COMBAT ENGINE: Skill Calculator (Independent System)
// نظام مهارات مستقل - تم تعديله ليدعم دمج اللاعب في مهارات محددة
// ================================================================

// القيمة 5.0 تعني أن مهارة بقوة 100 تسبب 500 ضرر (للمهارات العادية التي تعتمد على اللفل)
const GLOBAL_SKILL_MULTIPLIER = 5.0;

function calculateSkillRawValue(skillConfig, currentLevel) {
    if (!skillConfig) return 0;
    const level = Math.max(1, currentLevel || 1);
    return skillConfig.base_value + (skillConfig.value_increment * (level - 1));
}

function executeSkill(attacker, defender, skill, isOwner = false) {
    const result = {
        damage: 0, heal: 0, shield: 0, selfDamage: 0,
        effectsApplied: [], selfEffects: [], log: ""
    };

    const multiplier = isOwner ? 10 : 1;
    
    // حساب قوة المهارة الأساسية (للمهارات التي تعتمد على اللفل)
    const rawValue = calculateSkillRawValue(skill, skill.currentLevel);
    let skillPower = Math.floor(rawValue * GLOBAL_SKILL_MULTIPLIER);

    // تطبيق البفات على قوة المهارة السحرية
    if (attacker.effects && attacker.effects.buff > 0) skillPower *= (1 + attacker.effects.buff);
    if (attacker.effects && attacker.effects.weaken > 0) skillPower *= (1 - attacker.effects.weaken);
    
    skillPower = Math.floor(skillPower * multiplier);

    // ====================================================
    // 🔮 منطق المهارات (Stat Types)
    // ====================================================

    switch (skill.stat_type) {
        
        // --- 🎲 RNG: Gamble (تعديل جذري) ---
        case 'RNG': {
            // 🔥 يعتمد على دمج اللاعب الحالي (سلاح + قوة)
            const playerDmg = attacker.atk; 

            if (Math.random() < 0.5) {
                // ✅ نجاح: ضعف دمج اللاعب
                result.damage = Math.floor(playerDmg * 2);
                result.log = `🎲 **${getName(attacker)}** نجحت مقامرته! سدد ضربة مزدوجة (${result.damage})!`;
            } else {
                // ❌ فشل: لا يوجد دمج للعدو + دمج للنفس (عقاب)
                result.damage = 0;
                result.selfDamage = Math.floor(attacker.maxHp * 0.1); // خسارة 10% من الدم
                result.log = `🎲 **${getName(attacker)}** فشلت مقامرته وتلقى ضرراً ارتدادياً!`;
            }
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
            // 🔥 تعديل صيحة الحرب (Buffing) لتعتمد على لفل المهارة
            else if (skill.id === 'skill_buffing') {
                // النسبة = 10% أساسي + 5% لكل لفل للمهارة
                let buffPercent = 0.10 + (skill.currentLevel * 0.05);
                
                // سقف للقوة لكي لا تصبح خيالية (مثلاً 100% كحد أقصى)
                if (buffPercent > 1.0) buffPercent = 1.0; 

                // تعزيز الهجوم القادم (جولة واحدة أو جولتين)
                result.selfEffects.push({ type: 'atk_buff', val: buffPercent, turns: 2 });
                
                result.log = `💪 **${getName(attacker)}** أطلق صيحة حرب! (تعزيز الهجوم القادم بنسبة ${Math.floor(buffPercent * 100)}%)`;
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
                result.damage = skillPower;
                result.log = `💥 **${getName(attacker)}** استخدم ${skill.name} وسبب ${result.damage} ضرر!`;
            }
            break;

        // --- 🐲 Dragon: TrueDMG_Burn ---
        case 'TrueDMG_Burn': {
            result.damage = skillPower;
            const burnVal = Math.floor(skillPower * 0.2);
            result.effectsApplied.push({ type: 'burn', val: burnVal, turns: 3 });

            let extraMsg = "";
            if (Math.random() < 0.05) { 
                result.effectsApplied.push({ type: 'stun', val: true, turns: 1 });
                extraMsg = " 🥶 وتجمد من الرعب!";
            }
            
            result.log = `🐲 **${getName(attacker)}** أطلق ${skill.name}! (${result.damage} ضرر حقيقي).${extraMsg}`;
            break;
        }

        // --- ⚔️ Human: Cleanse_Buff_Shield ---
        case 'Cleanse_Buff_Shield': {
            result.selfEffects.push({ type: 'cleanse' });
            const buffPercent = rawValue / 100;
            result.selfEffects.push({ type: 'buff', val: buffPercent, turns: 2 });

            const shieldAmount = Math.floor((attacker.maxHp * 0.10) + (skillPower * 0.5));
            result.shield = shieldAmount;

            result.log = `⚔️ **${getName(attacker)}** استخدم ${skill.name}! (تطهير + هجوم + درع)`;
            break;
        }

        // --- ⚖️ Seraphim: Scale_MissingHP_Heal ---
        case 'Scale_MissingHP_Heal': {
            const missingHpPercent = (attacker.maxHp - attacker.hp) / attacker.maxHp;
            const bonusDmg = Math.floor(skillPower * missingHpPercent * 0.5);
            result.damage = skillPower + bonusDmg;
            result.heal = Math.floor(skillPower * 0.4); 
            
            result.log = `⚖️ **${getName(attacker)}** عاقب بـ ${skill.name} (${result.damage}) وشفى نفسه!`;
            break;
        }

        // --- 👹 Demon: Sacrifice_Crit ---
        case 'Sacrifice_Crit': {
            result.selfDamage = Math.floor(attacker.maxHp * 0.10);
            result.damage = Math.floor(skillPower * 1.5); 
            result.log = `👹 **${getName(attacker)}** نفذ ${skill.name} وضحى بدمه لضربة مدمرة (${result.damage})!`;
            break;
        }

        // --- 🏹 Elf: Stun_Vulnerable ---
        case 'Stun_Vulnerable': {
            result.damage = Math.floor(skillPower * 0.7); 
            result.effectsApplied.push({ type: 'stun', val: true, turns: 1 });
            result.effectsApplied.push({ type: 'weaken', val: 0.3, turns: 2 });

            result.log = `🏹 **${getName(attacker)}** أطلق ${skill.name} وشل حركة الخصم!`;
            break;
        }

        // --- 🗡️ Dark Elf: Confusion ---
        case 'Confusion': {
            result.damage = Math.floor(skillPower * 0.85);
            result.effectsApplied.push({ type: 'confusion', val: true, turns: 2 });
            result.log = `🗡️ **${getName(attacker)}** استخدم ${skill.name} وأربك عقل الخصم!`;
            break;
        }

        // --- 🩸 Vampire: Lifesteal_Overheal ---
        case 'Lifesteal_Overheal': {
            result.damage = skillPower;
            const potentialHeal = Math.floor(result.damage * 0.5);
            const missingHp = attacker.maxHp - attacker.hp;

            if (potentialHeal > missingHp) {
                result.heal = missingHp;
                result.shield = Math.floor((potentialHeal - missingHp) * 0.5);
                result.log = `🩸 **${getName(attacker)}** استخدم ${skill.name} وحول الفائض لدرع!`;
            } else {
                result.heal = potentialHeal;
                result.log = `🩸 **${getName(attacker)}** امتص ${potentialHeal} HP بـ ${skill.name}!`;
            }
            break;
        }

        // --- 🌀 Hybrid: Chaos_RNG ---
        case 'Chaos_RNG': {
            result.damage = Math.floor(skillPower * 0.9);
            const rand = Math.random();
            let effectMsg = "";
            if (rand < 0.25) {
                result.effectsApplied.push({ type: 'burn', val: Math.floor(skillPower * 0.2), turns: 3 }); effectMsg = "حرق";
            } else if (rand < 0.50) {
                result.effectsApplied.push({ type: 'weaken', val: 0.3, turns: 2 }); effectMsg = "إضعاف";
            } else if (rand < 0.75) {
                result.effectsApplied.push({ type: 'confusion', val: true, turns: 2 }); effectMsg = "ارتباك";
            } else {
                result.effectsApplied.push({ type: 'poison', val: Math.floor(skillPower * 0.2), turns: 3 }); effectMsg = "سم";
            }
            result.log = `🌀 **${getName(attacker)}** أطلق ${skill.name} وسبب فوضى (${effectMsg})!`;
            break;
        }

        // --- 👻 Spirit: Dmg_Blind ---
        case 'Dmg_Blind': {
            result.damage = skillPower;
            result.effectsApplied.push({ type: 'blind', val: 0.5, turns: 2 }); 
            result.log = `👻 **${getName(attacker)}** استخدم ${skill.name} وأصاب خصمه بالعمى!`;
            break;
        }
        
        // --- 🛡️ Dwarf: Reflect_Tank ---
        case 'Reflect_Tank': {
            result.shield = Math.floor(skillPower * 1.5);
            result.selfEffects.push({ type: 'rebound_active', val: 0.4, turns: 2 });
            result.log = `🛡️ **${getName(attacker)}** نفذ ${skill.name} (دفاع وعكس ضرر)!`;
            break;
        }

        // --- 🧟 Ghoul: Execute_Heal ---
        case 'Execute_Heal': {
            result.damage = skillPower;
            const bleedDmg = Math.floor(skillPower * 0.15);
            result.effectsApplied.push({ type: 'poison', val: bleedDmg, turns: 3 });

            if (defender.hp - result.damage <= 0) {
                result.damage = defender.hp; 
                result.heal = Math.floor(attacker.maxHp * 0.20);
                result.log = `🧟 **${getName(attacker)}** مزق خصمه بـ ${skill.name} وافترسه!`;
            } else {
                result.log = `🧟 **${getName(attacker)}** سبب نزيفاً حاداً بـ ${skill.name}!`;
            }
            break;
        }

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
