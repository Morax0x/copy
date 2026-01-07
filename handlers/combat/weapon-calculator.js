// ================================================================
// ⚔️ COMBAT ENGINE: Weapon Calculator
// المسؤول عن حساب الهجوم العادي، الكريت، الدفاع، والمراوغة
// ================================================================

const path = require('path');
// ✅ تصحيح المسار: الرجوع من handlers/combat إلى الجذر ثم الدخول لـ handlers/dungeon
const { OWNER_ID } = require('../../dungeon/constants'); 

/**
 * دالة لحساب ضرر السلاح الخام بناءً على الليفل (بدون بفات)
 * @param {Object} weaponConfig - إعدادات السلاح من JSON
 * @param {number} level - مستوى السلاح الحالي
 */
function getWeaponRawDamage(weaponConfig, level) {
    if (!weaponConfig || level < 1) return 15; // ضرر افتراضي (بدون سلاح)
    return weaponConfig.base_damage + (weaponConfig.damage_increment * (level - 1));
}

/**
 * تنفيذ هجوم السلاح وحساب النتائج النهائية
 * @param {Object} attacker - المهاجم
 * @param {Object} defender - المدافع
 * @param {boolean} isOwner - هل المهاجم هو الأونر (للمضاعفات)
 */
function executeWeaponAttack(attacker, defender, isOwner = false) {
    const result = {
        damage: 0,          // الضرر النهائي الذي تلقاه الخصم
        blocked: 0,         // مقدار الضرر الذي امتصه الدرع
        reflected: 0,       // الضرر المنعكس على المهاجم
        isCrit: false,      // هل كانت ضربة حرجة؟
        isMiss: false,      // هل أخطأت الضربة؟
        log: ""             // سجل العملية
    };

    // 1. تحديد الضرر الأساسي
    let baseDmg = 15;
    if (attacker.weapon && attacker.weapon.currentDamage) {
        baseDmg = attacker.weapon.currentDamage;
    } else if (attacker.atk) {
        baseDmg = attacker.atk; // للوحوش
    }

    // 2. تطبيق البفات والدي-بفات (Buffs & Debuffs)
    let multiplier = 1.0;
    
    // دعم كلا الصيغتين (Array للدانجون و Object للـ PvP)
    if (attacker.effects) {
        if (Array.isArray(attacker.effects)) {
            const buff = attacker.effects.find(e => e.type === 'atk_buff');
            const weaken = attacker.effects.find(e => e.type === 'weakness');
            if (buff) multiplier += buff.val;
            if (weaken) multiplier -= weaken.val;
        } else {
            if (attacker.effects.buff > 0) multiplier += attacker.effects.buff;      
            if (attacker.effects.weaken > 0) multiplier -= attacker.effects.weaken; 
        }
    }
    
    // التأكد أن المضاعف لا يقل عن 10%
    if (multiplier < 0.1) multiplier = 0.1;

    let finalDmg = Math.floor(baseDmg * multiplier);

    // 3. التحقق من العمى (Blind)
    let isBlind = false;
    if (attacker.effects) {
        if (Array.isArray(attacker.effects)) isBlind = attacker.effects.some(e => e.type === 'blind');
        else isBlind = attacker.effects.blind > 0;
    }

    if (isBlind && Math.random() < 0.5) {
        result.isMiss = true;
        result.log = `☁️ **${getName(attacker)}** أخطأ الهدف بسبب العمى!`;
        return result;
    }

    // 4. التحقق من مراوغة الخصم (Evasion)
    let isEvasion = false;
    if (defender.effects) {
        if (Array.isArray(defender.effects)) isEvasion = defender.effects.some(e => e.type === 'evasion');
        else isEvasion = defender.effects.evasion > 0;
    }

    if (isEvasion) {
        result.isMiss = true;
        result.log = `👻 **${getName(defender)}** تفادى الهجوم تماماً (مراوغة)!`;
        return result;
    }

    // 5. حساب الضربة الحرجة (Critical Hit)
    const critRate = 0.20 + (attacker.critRate || 0);
    if (Math.random() < critRate) {
        result.isCrit = true;
        finalDmg = Math.floor(finalDmg * 1.5); // الكريت يضرب 150%
    }

    // مضاعف الأونر
    if (isOwner) finalDmg *= 10;

    // تباين عشوائي بسيط
    const variance = 0.95 + Math.random() * 0.1;
    finalDmg = Math.floor(finalDmg * variance);

    // 6. تطبيق دفاع الخصم (Reduction)
    let dmgReduce = 0;
    if (defender.effects) {
        if (Array.isArray(defender.effects)) {
            const red = defender.effects.find(e => e.type === 'dmg_reduce');
            if (red) dmgReduce = red.val;
        } else {
            dmgReduce = defender.effects.dmg_reduce || 0;
        }
    }

    if (dmgReduce > 0) {
        finalDmg = Math.floor(finalDmg * (1 - dmgReduce));
    }

    // 7. التعامل مع الدروع (Shields) - منطق محسّن
    let currentShield = 0;
    
    // استخراج قيمة الدرع بدقة
    if (defender.effects) {
        if (Array.isArray(defender.effects)) {
            const sh = defender.effects.find(e => e.type === 'shield' || e.type === 'titan');
            if (sh) currentShield = sh.val;
        } else {
            currentShield = defender.effects.shield || 0;
        }
    }
    // فحص احتياطي للجذر (بعض الوحوش)
    if (currentShield === 0 && defender.shield > 0) currentShield = defender.shield;

    // 🔥 المنطق الحاسم: إذا كان هناك درع، احسب الامتصاص. وإلا، فالامتصاص صفر.
    if (currentShield > 0) {
        if (currentShield >= finalDmg) {
            // الدرع يمتص الضربة بالكامل
            result.blocked = finalDmg;
            finalDmg = 0; 
        } else {
            // الدرع يمتص جزءاً وينكسر
            result.blocked = currentShield;
            finalDmg -= currentShield;
        }
    } else {
        result.blocked = 0;
    }

    // 8. عكس الضرر (Reflect)
    let reboundVal = 0;
    if (defender.effects) {
        if (Array.isArray(defender.effects)) {
            const reb = defender.effects.find(e => e.type === 'rebound_active' || e.type === 'reflect');
            if (reb) reboundVal = reb.val;
        } else {
            reboundVal = defender.effects.rebound_active || 0;
        }
    }

    if (finalDmg > 0 && reboundVal > 0) {
        result.reflected = Math.floor(finalDmg * reboundVal);
        // ملاحظة: الخصم من المهاجم يتم في الملف الرئيسي
    }

    // 9. النتيجة النهائية
    result.damage = Math.max(0, finalDmg);
    
    // 🛑 تمت إزالة سطر defender.hp -= result.damage;
    // لكي يقوم pvp-core.js بالتحكم الكامل وتفادي التكرار.

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

// دالة مساعدة لجلب الاسم
function getName(entity) {
    if (entity.isMonster) return entity.name;
    if (entity.member) return entity.member.displayName;
    return entity.name || "Unknown";
}

module.exports = { getWeaponRawDamage, executeWeaponAttack };
