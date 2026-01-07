// ================================================================
// ⚔️ COMBAT ENGINE: Weapon Calculator (Fixed & Robust)
// ================================================================

const path = require('path');
const { OWNER_ID } = require('../dungeon/constants'); 

// دالة ذكية لجلب قيمة الدرع مهما كان شكل البيانات (Object أو Array)
function getShieldValue(entity) {
    if (!entity) return 0;
    
    // 1. فحص الدرع في الجذر (Root) - مستخدم في بعض أنظمة الدانجون
    if (typeof entity.shield === 'number' && entity.shield > 0) return entity.shield;

    // 2. فحص الدرع داخل التأثيرات (Effects)
    if (entity.effects) {
        // حالة أ: التأثيرات عبارة عن كائن (PvP System)
        if (!Array.isArray(entity.effects)) {
            return entity.effects.shield || 0;
        }
        // حالة ب: التأثيرات عبارة عن مصفوفة (Dungeon System)
        else {
            const shieldEffect = entity.effects.find(e => e.type === 'shield' || e.type === 'titan');
            // بعض المهارات تعطي درعاً كقيمة val
            return shieldEffect ? (shieldEffect.val || 0) : 0;
        }
    }
    return 0;
}

// دالة ذكية لجلب نسبة تقليل الضرر (Defense Buffs)
function getDmgReduction(entity) {
    if (!entity || !entity.effects) return 0;
    
    if (!Array.isArray(entity.effects)) {
        return entity.effects.dmg_reduce || 0;
    } else {
        const reduceEffect = entity.effects.find(e => e.type === 'dmg_reduce');
        return reduceEffect ? (reduceEffect.val || 0) : 0;
    }
}

function getWeaponRawDamage(weaponConfig, level) {
    if (!weaponConfig || level < 1) return 15; 
    return weaponConfig.base_damage + (weaponConfig.damage_increment * (level - 1));
}

function executeWeaponAttack(attacker, defender, isOwner = false) {
    const result = {
        damage: 0,          
        blocked: 0,         
        reflected: 0,       
        isCrit: false,      
        isMiss: false,      
        log: ""             
    };

    // 1. تحديد الضرر الأساسي
    let baseDmg = 15;
    if (attacker.weapon && attacker.weapon.currentDamage) {
        baseDmg = attacker.weapon.currentDamage;
    } else if (attacker.atk) {
        baseDmg = attacker.atk; 
    }

    // 2. تطبيق البفات (Buffs/Debuffs)
    let multiplier = 1.0;
    
    // التعامل مع البفات سواء كانت Object أو Array
    if (attacker.effects) {
        if (!Array.isArray(attacker.effects)) {
            // PvP Logic
            if (attacker.effects.buff > 0) multiplier += attacker.effects.buff;      
            if (attacker.effects.weaken > 0) multiplier -= attacker.effects.weaken; 
        } else {
            // Dungeon Logic
            const buff = attacker.effects.find(e => e.type === 'atk_buff');
            const weaken = attacker.effects.find(e => e.type === 'weakness'); // انتبه للمسميات
            if (buff) multiplier += buff.val;
            if (weaken) multiplier -= weaken.val;
        }
    }
    
    if (multiplier < 0.1) multiplier = 0.1;
    let finalDmg = Math.floor(baseDmg * multiplier);

    // 3. التحقق من العمى (Blind)
    let isBlind = false;
    if (attacker.effects) {
        if (!Array.isArray(attacker.effects)) isBlind = attacker.effects.blind > 0;
        else isBlind = attacker.effects.some(e => e.type === 'blind');
    }

    if (isBlind && Math.random() < 0.5) {
        result.isMiss = true;
        result.log = `☁️ **${getName(attacker)}** أخطأ الهدف بسبب العمى!`;
        return result;
    }

    // 4. التحقق من المراوغة
    let isEvasion = false;
    if (defender.effects) {
        if (!Array.isArray(defender.effects)) isEvasion = defender.effects.evasion > 0;
        else isEvasion = defender.effects.some(e => e.type === 'evasion');
    }

    if (isEvasion) {
        result.isMiss = true;
        result.log = `👻 **${getName(defender)}** تفادى الهجوم تماماً (مراوغة)!`;
        return result;
    }

    // 5. حساب الكريت
    const critRate = 0.20 + (attacker.critRate || 0);
    if (Math.random() < critRate) {
        result.isCrit = true;
        finalDmg = Math.floor(finalDmg * 1.5); 
    }

    if (isOwner) finalDmg *= 10;

    const variance = 0.95 + Math.random() * 0.1;
    finalDmg = Math.floor(finalDmg * variance);

    // 6. تطبيق دفاع الخصم (Reduction)
    const dmgReduce = getDmgReduction(defender);
    if (dmgReduce > 0) {
        finalDmg = Math.floor(finalDmg * (1 - dmgReduce));
    }

    // 7. التعامل مع الدروع (Shields) - المنطق المصحح
    // نجلب قيمة الدرع باستخدام الدالة الذكية
    let currentShield = getShieldValue(defender);
    
    // 🔥🔥 إصلاح جوهري: إذا لم يكن هناك درع، التجاوز فوراً 🔥🔥
    if (currentShield > 0) {
        if (currentShield >= finalDmg) {
            // الدرع يمتص كل الضربة
            result.blocked = finalDmg;
            finalDmg = 0; 
        } else {
            // الدرع يمتص جزءاً وينكسر
            result.blocked = currentShield;
            finalDmg -= currentShield;
        }
    } else {
        result.blocked = 0; // تأكيد أن الامتصاص صفر
    }

    // 8. عكس الضرر
    let reboundVal = 0;
    if (defender.effects) {
        if (!Array.isArray(defender.effects)) reboundVal = defender.effects.rebound_active || 0;
        else {
            const reb = defender.effects.find(e => e.type === 'rebound_active' || e.type === 'reflect');
            reboundVal = reb ? reb.val : 0;
        }
    }

    if (finalDmg > 0 && reboundVal > 0) {
        result.reflected = Math.floor(finalDmg * reboundVal);
        // ملاحظة: الخصم من صحة المهاجم يتم في الملف الرئيسي pvp-core.js
    }

    // 9. النتيجة النهائية
    result.damage = Math.max(0, finalDmg);
    
    // إذا كان المهاجم لاعب، نسجل الضرر الكلي للإحصائيات
    if (attacker.totalDamage !== undefined) attacker.totalDamage += result.damage;

    // 10. صياغة الرسالة
    let msg = `🗡️ **${getName(attacker)}** ${result.isCrit ? '**CRIT!**' : ''} سبب ${result.damage} ضرر.`;
    
    if (result.blocked > 0) {
        if (result.damage === 0) {
            msg = `🛡️ **${getName(attacker)}** ضرب الدرع! (${result.blocked} ممتص).`;
        } else {
            msg += ` (الدرع امتص ${result.blocked})`;
        }
    }

    if (result.reflected > 0) {
        msg += `\n🔄 **${getName(defender)}** عكس ${result.reflected} ضرر!`;
    }

    result.log = msg;
    return result;
}

function getName(entity) {
    if (entity.isMonster) return entity.name;
    if (entity.member) return entity.member.user ? entity.member.user.displayName : entity.member.displayName;
    return entity.name || "Unknown";
}

module.exports = { getWeaponRawDamage, executeWeaponAttack };
