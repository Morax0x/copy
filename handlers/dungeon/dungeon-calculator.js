// ================================================================
// 🐲 DUNGEON CALCULATOR (PvE ONLY)
// محرك خاص لحسابات الدانجون فقط (بسيط، مباشر، وبدون تعقيدات الـ PvP)
// ================================================================

const { OWNER_ID } = require('./constants');

/**
 * حساب ضرر اللاعب ضد الوحش
 */
function calculatePlayerDamage(player, monster) {
    // 1. الضرر الأساسي (من السلاح أو القوة)
    let damage = player.atk;

    // في حال كان السلاح مخزناً بطريقة مختلفة
    if (player.weapon && player.weapon.currentDamage) {
        // نأخذ الأقوى بين السلاح والـ ATK الأساسي
        damage = Math.max(damage, player.weapon.currentDamage);
    }

    // 2. تطبيق البفات (Buffs)
    let multiplier = 1.0;
    if (player.effects) {
        const buff = player.effects.find(e => e.type === 'atk_buff' || e.type === 'buff');
        const weaken = player.effects.find(e => e.type === 'weaken');
        
        if (buff) multiplier += buff.val;
        if (weaken) multiplier -= weaken.val;
    }

    // 3. تأثير الختم (Sealed)
    if (player.isSealed) {
        multiplier *= (player.sealMultiplier || 0.5);
    }

    if (multiplier < 0.1) multiplier = 0.1;
    damage = Math.floor(damage * multiplier);

    // 4. الكريتيكال (Crit)
    let isCrit = false;
    // فرصة أساسية 15% + أي بونص
    const critChance = 0.15 + (player.critRate || 0); 
    if (Math.random() < critChance) {
        isCrit = true;
        damage = Math.floor(damage * 1.5); // 150% ضرر
    }

    // 5. تباين عشوائي (Variance ±5%)
    const variance = (Math.random() * 0.1) + 0.95;
    damage = Math.floor(damage * variance);

    // 6. مضاعف الأونر
    if (player.id === OWNER_ID) {
        damage = Math.floor(damage * 2.0); // ضعف الضرر للأونر في الدانجون
    }
    
    // 7. نقاط ضعف الوحش
    if (monster.effects && monster.effects.some(e => e.type === 'weakness')) {
        damage = Math.floor(damage * 1.5); // +50% ضرر إضافي
    }

    if (damage < 1) damage = 1;

    return { damage, isCrit };
}

/**
 * حساب ضرر الوحش ضد اللاعب
 */
function calculateMonsterDamage(monster, player) {
    let damage = monster.atk;

    // تباين عشوائي
    damage = Math.floor(damage * ((Math.random() * 0.2) + 0.9));

    // دفاع اللاعب (درع + مهارات)
    let damageReduction = 0;
    
    // مهارات تقليل الضرر
    if (player.effects) {
        const reductionBuff = player.effects.find(e => e.type === 'dmg_reduce');
        if (reductionBuff) damageReduction += reductionBuff.val;
        
        const defBuff = player.effects.find(e => e.type === 'def_buff');
        if (defBuff) damageReduction += defBuff.val;
    }

    if (player.defending) {
        damageReduction += 0.5; // الدفاع يقلل 50%
    }

    if (damageReduction > 0.9) damageReduction = 0.9; // سقف الدفاع 90%
    
    damage = Math.floor(damage * (1 - damageReduction));

    // مراوغة اللاعب
    let isMiss = false;
    if (player.effects && player.effects.some(e => e.type === 'evasion')) {
        isMiss = true;
        damage = 0;
    }

    if (damage < 0) damage = 0;

    return { damage, isMiss };
}

module.exports = { calculatePlayerDamage, calculateMonsterDamage };
