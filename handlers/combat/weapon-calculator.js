const path = require('path');
const { OWNER_ID } = require('../dungeon/constants'); 

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

    let baseDmg = 15;
    if (attacker.weapon && attacker.weapon.currentDamage) {
        baseDmg = attacker.weapon.currentDamage;
    } else if (attacker.atk) {
        baseDmg = attacker.atk; 
    }

    let multiplier = 1.0;
    if (attacker.effects) {
        if (attacker.effects.buff > 0) multiplier += attacker.effects.buff;      
        if (attacker.effects.weaken > 0) multiplier -= attacker.effects.weaken; 
    }
    
    if (multiplier < 0.1) multiplier = 0.1;

    let finalDmg = Math.floor(baseDmg * multiplier);

    if (attacker.effects && attacker.effects.blind > 0) {
        if (Math.random() < 0.5) {
            result.isMiss = true;
            result.log = `☁️ **${getName(attacker)}** أخطأ الهدف بسبب العمى!`;
            return result;
        }
    }

    if (defender.effects && defender.effects.evasion > 0) {
        result.isMiss = true;
        result.log = `👻 **${getName(defender)}** تفادى الهجوم تماماً (مراوغة)!`;
        return result;
    }

    const critRate = 0.20 + (attacker.critRate || 0);
    if (Math.random() < critRate) {
        result.isCrit = true;
        finalDmg = Math.floor(finalDmg * 1.5); 
    }

    if (isOwner) finalDmg *= 10;

    const variance = 0.95 + Math.random() * 0.1;
    finalDmg = Math.floor(finalDmg * variance);

    if (defender.effects && defender.effects.dmg_reduce > 0) {
        finalDmg = Math.floor(finalDmg * (1 - defender.effects.dmg_reduce));
    }

    let currentShield = (defender.effects && defender.effects.shield) ? defender.effects.shield : 0;
    
    if (currentShield > 0) {
        if (currentShield >= finalDmg) {
            result.blocked = finalDmg;
            finalDmg = 0; 
        } else {
            result.blocked = currentShield;
            finalDmg -= currentShield;
        }
    }

    if (finalDmg > 0 && defender.effects && defender.effects.rebound_active > 0) {
        result.reflected = Math.floor(finalDmg * defender.effects.rebound_active);
        attacker.hp -= result.reflected; 
    }

    result.damage = Math.max(0, finalDmg);
    
    if (attacker.totalDamage !== undefined) attacker.totalDamage += result.damage;

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

function getName(entity) {
    if (entity.isMonster) return entity.name;
    if (entity.member) return entity.member.displayName;
    return entity.name || "Unknown";
}

module.exports = { getWeaponRawDamage, executeWeaponAttack };
