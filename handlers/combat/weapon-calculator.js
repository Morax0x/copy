// ================================================================
// ⚔️ COMBAT ENGINE: Weapon Calculator
// المسؤول عن حساب الهجوم العادي، الكريت، الدفاع، والمراوغة
// ================================================================

const path = require('path');
// ⚠️ تأكد أن هذا المسار يشير إلى ملف الثوابت الصحيح في مشروعك
const { OWNER_ID } = require('../../dungeon/constants'); 

/**
 * دالة لحساب ضرر السلاح الخام بناءً على الليفل (بدون بفات)
 * @param {Object} weaponConfig - إعدادات السلاح من JSON
 * @param {number} level - مستوى السلاح الحالي
 */
function getWeaponRawDamage(weaponConfig, level) {
    if (!weaponConfig || level < 1) return 15; // ضرر افتراضي (بدون سلاح)
    // المعادلة: الأساس + (الزيادة * (المستوى - 1))
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
    if (attacker.effects) {
        if (attacker.effects.buff > 0) multiplier += attacker.effects.buff;     // زيادة الهجوم
        if (attacker.effects.weaken > 0) multiplier -= attacker.effects.weaken; // إضعاف الهجوم
    }
    
    // التأكد أن المضاعف لا يقل عن 10%
    if (multiplier < 0.1) multiplier = 0.1;

    let finalDmg = Math.floor(baseDmg * multiplier);

    // 3. التحقق من العمى (Blind) - نسبة خطأ 50%
    // ✅ (مهم جداً لميزة الروح الجديدة)
    if (attacker.effects && attacker.effects.blind > 0) {
        if (Math.random() < 0.5) {
            result.isMiss = true;
            result.log = `☁️ **${getName(attacker)}** أخطأ الهدف بسبب العمى!`;
            return result;
        }
    }

    // 4. التحقق من مراوغة الخصم (Evasion) - مراوغة تامة 100%
    if (defender.effects && defender.effects.evasion > 0) {
        result.isMiss = true;
        result.log = `👻 **${getName(defender)}** تفادى الهجوم تماماً (مراوغة)!`;
        return result;
    }

    // 5. حساب الضربة الحرجة (Critical Hit)
    // النسبة الأساسية 20% + أي بونص إضافي
    const critRate = 0.20 + (attacker.critRate || 0);
    if (Math.random() < critRate) {
        result.isCrit = true;
        finalDmg = Math.floor(finalDmg * 1.5); // الكريت يضرب 150%
    }

    // مضاعف الأونر (للتجربة والقوة)
    if (isOwner) finalDmg *= 10;

    // تباين عشوائي بسيط في الضرر (±5%) لواقعية أكثر
    const variance = 0.95 + Math.random() * 0.1;
    finalDmg = Math.floor(finalDmg * variance);

    // 6. تطبيق دفاع الخصم (Reduction) - مثل مهارة القزم
    if (defender.effects && defender.effects.dmg_reduce > 0) {
        finalDmg = Math.floor(finalDmg * (1 - defender.effects.dmg_reduce));
    }

    // 7. التعامل مع الدروع (Shields)
    if (defender.effects && defender.effects.shield > 0) {
        if (defender.effects.shield >= finalDmg) {
            // الدرع يمتص الضربة بالكامل
            defender.effects.shield -= finalDmg;
            result.blocked = finalDmg;
            finalDmg = 0;
        } else {
            // الدرع ينكسر ويمر باقي الضرر
            result.blocked = defender.effects.shield;
            finalDmg -= defender.effects.shield;
            defender.effects.shield = 0;
        }
    }

    // 8. عكس الضرر (Reflect)
    if (finalDmg > 0 && defender.effects && defender.effects.rebound_active > 0) {
        result.reflected = Math.floor(finalDmg * defender.effects.rebound_active);
        attacker.hp -= result.reflected;
    }

    // 9. التطبيق النهائي
    result.damage = Math.max(0, finalDmg);
    defender.hp -= result.damage;

    // زيادة عداد الضرر الكلي (للإحصائيات)
    if (attacker.totalDamage !== undefined) attacker.totalDamage += result.damage;

    // 10. صياغة الرسالة
    let msg = `🗡️ **${getName(attacker)}** ${result.isCrit ? '**CRIT!**' : ''} سبب ${result.damage} ضرر.`;
    
    if (result.blocked > 0 && result.damage === 0) {
        msg = `🛡️ **${getName(attacker)}** ضرب الدرع! (${result.blocked} ممتص).`;
    } else if (result.blocked > 0) {
        msg += ` (الدرع امتص ${result.blocked})`;
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
