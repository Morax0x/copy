const { OWNER_ID } = require('./constants');

function calculatePlayerDamage(player, monster) {
    let damage = player.atk;

    if (player.weapon && player.weapon.currentDamage) {
        damage = Math.max(damage, player.weapon.currentDamage);
    }

    let multiplier = 1.0;
    if (player.effects) {
        const buff = player.effects.find(e => e.type === 'atk_buff' || e.type === 'buff');
        const weaken = player.effects.find(e => e.type === 'weaken');
        
        if (buff) multiplier += buff.val;
        if (weaken) multiplier -= weaken.val;
    }

    if (player.isSealed) {
        multiplier *= (player.sealMultiplier || 0.5);
    }

    if (multiplier < 0.1) multiplier = 0.1;
    damage = Math.floor(damage * multiplier);

    let isCrit = false;
    const critChance = 0.15 + (player.critRate || 0); 
    if (Math.random() < critChance) {
        isCrit = true;
        damage = Math.floor(damage * 1.5); 
    }

    const variance = (Math.random() * 0.1) + 0.95;
    damage = Math.floor(damage * variance);

    if (player.id === OWNER_ID) {
        damage = Math.floor(damage * 2.0); 
    }
    
    if (monster.effects && monster.effects.some(e => e.type === 'weakness')) {
        damage = Math.floor(damage * 1.5); 
    }

    if (damage < 1) damage = 1;

    return { damage, isCrit };
}

function calculateMonsterDamage(monster, player) {
    let damage = monster.atk;

    damage = Math.floor(damage * ((Math.random() * 0.2) + 0.9));

    let damageReduction = 0;
    
    if (player.effects) {
        const reductionBuff = player.effects.find(e => e.type === 'dmg_reduce');
        if (reductionBuff) damageReduction += reductionBuff.val;
        
        const defBuff = player.effects.find(e => e.type === 'def_buff');
        if (defBuff) damageReduction += defBuff.val;
    }

    if (player.defending) {
        damageReduction += 0.5; 
    }

    if (damageReduction > 0.9) damageReduction = 0.9; 
    
    damage = Math.floor(damage * (1 - damageReduction));

    let isMiss = false;
    if (player.effects && player.effects.some(e => e.type === 'evasion')) {
        isMiss = true;
        damage = 0;
    }

    if (damage < 0) damage = 0;

    return { damage, isMiss };
}

module.exports = { calculatePlayerDamage, calculateMonsterDamage };
