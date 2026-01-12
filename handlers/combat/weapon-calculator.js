// ================================================================
// ⚔️ COMBAT ENGINE: Weapon Calculator (Fixed Buffs & Leader Skills)
// ================================================================

const { cleanDisplayName } = require('../dungeon/utils');

function getName(entity) {
    if (entity.isMonster) return entity.name;
    if (entity.member) return cleanDisplayName(entity.member.user.displayName);
    return entity.name || "Unknown";
}

function getWeaponRawDamage(weaponConfig, level) {
    if (!weaponConfig || level < 1) return 15;
    return weaponConfig.base_damage + (weaponConfig.damage_increment * (level - 1));
}

function executeWeaponAttack(attacker, defender, isOwner = false) {
    const result = {
        damage: 0,          
        shieldDamage: 0,    
        isCrit: false,
        isMiss: false,
        log: ""
    };

    const attackerName = getName(attacker);
    const defenderName = getName(defender);

    // 1. حساب الضرر الأساسي
    let rawDmg = 15;
    if (attacker.weapon && attacker.weapon.currentDamage) {
        rawDmg = attacker.weapon.currentDamage;
    } else if (attacker.atk) {
        rawDmg = attacker.atk; 
    }

    // =========================================================
    // 🔥 إصلاح حساب البفات (Buff Calculation Fix) 🔥
    // =========================================================
    let multiplier = 1.0;

    // 1. حساب البفات من المتغيرات المباشرة (PvP القديم)
    if (attacker.effects && !Array.isArray(attacker.effects)) {
        if (attacker.effects.buff > 0) multiplier += attacker.effects.buff;
        if (attacker.effects.weaken > 0) multiplier -= attacker.effects.weaken;
    }

    // 2. حساب البفات من المصفوفة (Dungeon System)
    // نستخدم forEach لجمع كل البفات المتراكمة
    if (attacker.effects && Array.isArray(attacker.effects)) {
        attacker.effects.forEach(eff => {
            // ✅ تفعيل زيادة الهجوم (يشمل صرخة الحرب العادية ومهارة القائد)
            if (eff.type === 'atk_buff' || eff.type === 'buff') {
                multiplier += eff.val;
            }
            if (eff.type === 'weaken') {
                multiplier -= eff.val;
            }
        });
    }

    // التأكد أن الضرر لا يقل عن 10%
    if (multiplier < 0.1) multiplier = 0.1;
    
    // تطبيق المضاعف
    rawDmg = Math.floor(rawDmg * multiplier);

    // =========================================================

    // 3. العمى (Blind)
    let isBlind = false;
    if (attacker.effects && !Array.isArray(attacker.effects) && attacker.effects.blind > 0) isBlind = true;
    if (attacker.effects && Array.isArray(attacker.effects) && attacker.effects.some(e => e.type === 'blind')) isBlind = true;

    if (isBlind && Math.random() < 0.5) {
        result.isMiss = true;
        result.log = `☁️ **${attackerName}** هاجم وأخطأ الهدف بسبب العمى!`;
        return result;
    }

    // 4. المراوغة (Evasion)
    let isEvasion = false;
    if (defender.effects && !Array.isArray(defender.effects) && defender.effects.evasion > 0) isEvasion = true;
    if (defender.effects && Array.isArray(defender.effects) && defender.effects.some(e => e.type === 'evasion')) isEvasion = true;

    if (isEvasion) {
        result.isMiss = true;
        result.log = `👻 **${defenderName}** تفادى الهجوم ببراعة!`;
        return result;
    }

    // 5. الكريتيكال
    let critBonus = 0;
    
    // إضافة نسبة الكريتيكال من خصائص اللاعب الأساسية
    if (attacker.critRate) critBonus += attacker.critRate;

    // ✅ تفعيل بفات الكريت والحظ (Dungeon Logic)
    if (attacker.effects && Array.isArray(attacker.effects)) {
        // إذا عنده "crit_buff" (من مهارة القائد) -> النسبة تصبح 100% فوراً
        if (attacker.effects.some(e => e.type === 'crit_buff')) {
            critBonus += 10.0; // رقم كبير جداً لضمان الضربة
        }
        // إذا عنده "luck_buff" -> نزيد النسبة 20%
        if (attacker.effects.some(e => e.type === 'luck_buff')) {
            critBonus += 0.20;
        }
    }
    
    const critRate = 0.15 + critBonus;
    if (Math.random() < critRate) {
        result.isCrit = true;
        rawDmg = Math.floor(rawDmg * 1.5);
    }

    if (isOwner) rawDmg *= 5;

    // تباين عشوائي (±10%)
    const variance = (Math.random() * 0.2) + 0.9;
    rawDmg = Math.floor(rawDmg * variance);

    // 6. دفاع الخصم
    let damageReduction = 0;
    if (defender.defending) damageReduction += 0.5; 
    
    if (defender.effects) {
        if (Array.isArray(defender.effects)) {
            // نظام الدانجون
            defender.effects.forEach(eff => {
                if (eff.type === 'def_buff' || eff.type === 'dmg_reduce') {
                    damageReduction += eff.val;
                }
            });
        } else {
            // نظام الـ PvP القديم
            if (defender.effects.dmg_reduce > 0) damageReduction += defender.effects.dmg_reduce;
        }
    }
    
    if (damageReduction > 0.9) damageReduction = 0.9;
    rawDmg = Math.floor(rawDmg * (1 - damageReduction));

    if (rawDmg < 1) rawDmg = 1;

    // =========================================================
    // 🔥🔥 توزيع الضرر الصارم (الدروع vs الصحة) 🔥🔥
    // =========================================================
    
    let currentShield = 0;
    if (defender.shield && defender.shield > 0) currentShield = defender.shield; // Dungeon Style
    else if (defender.effects && defender.effects.shield > 0) currentShield = defender.effects.shield; // PvP Style

    let hpDmg = 0;
    let shieldDmg = 0;

    if (currentShield > 0) {
        if (currentShield >= rawDmg) {
            shieldDmg = rawDmg;
            if (defender.shield) defender.shield -= rawDmg;
            else defender.effects.shield -= rawDmg;
            hpDmg = 0;
        } else {
            shieldDmg = currentShield;
            hpDmg = rawDmg - currentShield;
            if (defender.shield) defender.shield = 0;
            else defender.effects.shield = 0;
        }
    } else {
        hpDmg = rawDmg;
        shieldDmg = 0;
    }

    if (hpDmg > 0) {
        defender.hp -= hpDmg;
        if (defender.hp < 0) defender.hp = 0;
    }

    result.damage = hpDmg;
    result.shieldDamage = shieldDmg;

    if (attacker.totalDamage !== undefined) attacker.totalDamage += hpDmg;

    // =========================================================
    // 📝 السجل (Log)
    // =========================================================

    let logMsg = "";
    const critText = result.isCrit ? "🔥 **CRIT!** " : "";

    if (hpDmg === 0 && shieldDmg > 0) {
        logMsg = `🛡️ **${defenderName}** لم يتضرر! الدرع امتص الهجوم (${shieldDmg}).`;
    } 
    else if (hpDmg > 0 && shieldDmg > 0) {
        logMsg = `${critText}⚔️ **${attackerName}** حطم الدرع (-${shieldDmg}) وسبب **${hpDmg}** ضرر!`;
    } 
    else {
        logMsg = `${critText}🗡️ **${attackerName}** هاجم وسبب **${hpDmg}** ضرر.`;
        if (defender.defending) logMsg += ` (دفاع)`;
    }

    result.log = logMsg;
    return result;
}

module.exports = { getWeaponRawDamage, executeWeaponAttack };
