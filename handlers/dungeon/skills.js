const { OWNER_ID } = require('./constants');
const { applyDamageToPlayer } = require('./utils');

// دالة مساعدة لتحديد الهدف (الزعيم أو المساند)
function getSkillTarget(monster, subMonster) {
    // 1. إذا المساند غير موجود أو ميت، الهدف هو الزعيم
    if (!subMonster || subMonster.hp <= 0) return monster;
    // 2. إذا الزعيم ميت، الهدف هو المساند
    if (monster.hp <= 0) return subMonster;
    // 3. إذا الاثنين أحياء، 50% عشوائي
    return Math.random() < 0.5 ? subMonster : monster;
}

function handleSkillUsage(player, skill, monster, subMonster, log, threadChannel, players) {
    let skillDmg = 0;
    const mult = (player.id === OWNER_ID) ? 10 : 1;

    // تحديد الهدف الحي لهذه المهارة
    const target = getSkillTarget(monster, subMonster);

    // حساب البفات (Buffs) لزيادة الهجوم
    let atkMultiplier = 1.0;
    if (player.effects) {
        player.effects.forEach(e => { if (e.type === 'atk_buff') atkMultiplier += e.val; });
    }
    const effectiveAtk = Math.floor(player.atk * atkMultiplier);

    // ====================================================
    // 🔥 1. مهارات الأونر الخاصة (الأولوية القصوى) 🔥
    // ====================================================
    if (skill.id === 'skill_owner_trap') {
        log.push(`🕳️ **${player.name}** قام بتفعيل فخ البعد الآخر يدوياً!`);
        return { type: 'force_trap' };
    }
    if (skill.id === 'skill_owner_teleport') {
        return { type: 'open_teleport_modal' };
    }
    if (skill.id === 'skill_secret_owner') {
        skillDmg = Math.floor(target.maxHp * 0.50); 
        target.hp -= skillDmg;
        player.totalDamage += skillDmg;
        log.push(`👁️ **${player.name}** استخدم "تركيز تام" وقصم **${target.name}** لنصفين! (**${skillDmg}** ضرر)`);
        return;
    }
    if (skill.id === 'skill_owner_leave') {
        monster.hp = 1; 
        if(subMonster) subMonster.hp = 0;
        log.push(`🚪 **${player.name}** غادر بلمح البصر، وترك الوحش يترنح (HP: 1)!`);
        if (threadChannel) threadChannel.send(`🚪 **${player.name}** غادر الدانجون بلمح البصر!`).catch(()=>{});
        return { type: 'owner_leave' };
    }

    // ====================================================
    // 2. مهارات الكلاسات (Class Skills)
    // ====================================================
    let classType = null;
    if (skill.id === 'class_special_skill') {
        classType = player.class;
    } else if (skill.id.startsWith('class_')) {
        let rawType = skill.id.split('_')[1]; 
        classType = rawType.charAt(0).toUpperCase() + rawType.slice(1);
    }

    if (classType) {
         if (player.special_cooldown > 0 && player.id !== OWNER_ID) {
             return { error: `⏳ المهارة في وقت انتظار (${player.special_cooldown} جولات)!` }; 
         }
         switch(classType) {
             case 'Leader': return { type: 'class_effect', effect: 'leader_buff', cooldown: 6 }; 
             case 'Tank': return { type: 'class_effect', effect: 'tank_taunt', cooldown: 6 }; 
             case 'Priest': return { type: 'class_effect', effect: 'priest_heal', cooldown: (player.id===OWNER_ID?0:6) }; 
             case 'Mage': return { type: 'class_effect', effect: 'mage_freeze', cooldown: 6 }; 
             case 'Summoner': return { type: 'class_effect', effect: 'summon_pet', cooldown: 6 }; 
         }
         return;
    }

    // ====================================================
    // 3. المهارات العادية (Standard Skills)
    // ====================================================
    
    const value = skill.effectValue || (skill.base_value ? skill.base_value * (player.id === OWNER_ID ? 2 : 1) : 0); 

    // التحقق من الكولداون
    if (!classType && skill.id !== 'skill_secret_owner' && skill.id !== 'skill_owner_leave') {
        if ((player.skillCooldowns[skill.id] || 0) > 0 && player.id !== OWNER_ID) {
            return { error: `⏳ المهارة "${skill.name}" في وقت انتظار (${player.skillCooldowns[skill.id]} جولات)!` };
        }
    }

    // تعيين الكولداون
    const setCD = (turns = 3) => { if (player.id !== OWNER_ID) player.skillCooldowns[skill.id] = turns; };
    if (skill.id.startsWith('race_')) setCD(5); else setCD(3);

    // 🔥 إصلاح مهارة الروح (Spirit/Evasion) 🔥
    if (skill.id === 'race_spirit_skill' || skill.stat_type === 'Dmg_Evasion') {
        skillDmg = Math.floor(effectiveAtk * 1.3) * mult;
        target.hp -= skillDmg;
        player.totalDamage += skillDmg;
        player.effects.push({ type: 'evasion', val: 1, turns: 1 });
        log.push(`👻 **${player.name}** ضرب **${target.name}** واختفى كالشبح! (مراوغة تامة)`);
        return; 
    }

    // تحديد نوع المهارة
    const type = (skill.stat_type || "").toLowerCase();

    // 🔥 Switch الرئيسي 🔥
    switch (type) {
        // --- الشفاء والتطهير ---
        case 'heal':
        case 'healing':
        case 'cleanse': {
            let healAmount = Math.floor(player.maxHp * (value / 100)) * mult;
            if (type === 'cleanse' || skill.id === 'skill_cleanse') {
                player.effects = []; 
                log.push(`✨ **${player.name}** تطهر وشفى **${healAmount}** HP.`);
            } else {
                log.push(`❤️‍🩹 **${player.name}** استخدم ${skill.name} واستعاد **${healAmount}** HP.`);
            }
            player.hp = Math.min(player.maxHp, player.hp + healAmount);
            break;
        }

        // --- الدروع ---
        case 'shield':
        case 'shielding':
        case 'cleanse_buff_shield': { 
            if (player.shield > 0) return { error: 'لديك درع بالفعل!' };
            
            if (type === 'cleanse_buff_shield') {
                player.effects = player.effects.filter(e => e.type === 'buff' || e.type === 'atk_buff');
                player.effects.push({ type: 'atk_buff', val: 0.2, turns: 2 });
            }

            let shieldAmount = Math.floor(player.maxHp * (value / 100)) * mult;
            player.shield = shieldAmount; 
            log.push(`${skill.emoji || '🛡️'} **${player.name}** فعل درعاً بقوة **${shieldAmount}**.`);
            break;
        }

        // --- البفات (Buffs) ---
        case 'buff':
        case 'atk_buff':
        case 'buffing': {
            player.effects.push({ type: 'atk_buff', val: (value / 100) * mult, turns: 3 });
            log.push(`💪 **${player.name}** رفع قوته الهجومية!`);
            break;
        }

        // --- السم (Poison) ---
        case 'poison': {
            skillDmg = Math.floor(effectiveAtk * 0.5) * mult; 
            target.effects.push({ type: 'poison', val: Math.floor(effectiveAtk * (value/100)) * mult, turns: 3 });
            target.hp -= skillDmg;
            player.totalDamage += skillDmg; 
            log.push(`☠️ **${player.name}** سمم **${target.name}**! (ضرر ${skillDmg}).`);
            break;
        }

        // --- الإضعاف ---
        case 'weaken':
        case 'weakness': {
            skillDmg = Math.floor(effectiveAtk * 0.5) * mult;
            target.effects.push({ type: 'weakness', val: 0.25, turns: 2 }); 
            target.hp -= skillDmg;
            player.totalDamage += skillDmg; 
            log.push(`📉 **${player.name}** أضعف **${target.name}** وسبب **${skillDmg}** ضرر.`);
            break;
        }
        case 'confusion': {
            skillDmg = Math.floor(effectiveAtk * 1.2) * mult;
            target.hp -= skillDmg;
            target.effects.push({ type: 'confusion', val: 0.5, turns: 2 });
            player.totalDamage += skillDmg;
            log.push(`😵 **${player.name}** ألقى لعنة الجنون على **${target.name}**! (${skillDmg} ضرر)`);
            break;
        }
        case 'stun_vulnerable': {
            skillDmg = Math.floor(effectiveAtk * 1.2) * mult;
            target.hp -= skillDmg;
            target.frozen = true;
            target.effects.push({ type: 'weakness', val: 0.5, turns: 1 });
            player.totalDamage += skillDmg;
            log.push(`🍃 **${player.name}** شل حركة **${target.name}**! (${skillDmg} ضرر)`);
            break;
        }

        // --- الانعكاس ---
        case 'reflect':
        case 'rebound': 
        case 'reflect_tank': {
            const reflectPercent = (value > 0 ? value / 100 : 0.5) * mult;
            player.effects.push({ type: 'reflect', val: reflectPercent, turns: 1 });
            
            if (type === 'reflect_tank') {
                const shieldVal = Math.floor(player.maxHp * 0.2);
                player.shield += shieldVal;
                player.effects.push({ type: 'dmg_reduce', val: 0.6, turns: 2 });
                log.push(`🔨 **${player.name}** تحصن بالجبل! (دفاع عالٍ + عكس الضرر)`);
            } else {
                log.push(`🌵 **${player.name}** جهز درع الأشواك (انعكاس)!`);
            }
            break;
        }

        // --- القمار ---
        case 'gamble': {
            const isSuccess = Math.random() < 0.5; 
            if (isSuccess) {
                const bonusDmg = Math.floor(effectiveAtk * 1.5) * mult;
                skillDmg = bonusDmg;
                log.push(`🎲 **${player.name}** خاطر ونجح! سدد ضربة مدمرة لـ **${target.name}** بمقدار **${skillDmg}**!`);
            } else {
                const selfDamage = Math.floor(player.maxHp * 0.25);
                skillDmg = Math.floor(effectiveAtk * 0.25) * mult;
                applyDamageToPlayer(player, selfDamage);
                log.push(`🎲 **${player.name}** خسر الرهان! تلقى **${selfDamage}** ضرر.`);
            }
            target.hp -= skillDmg;
            player.totalDamage += skillDmg;
            return;
        }

        // --- التبديد ---
        case 'dispel': {
            target.effects = []; 
            log.push(`💨 **${player.name}** بدد السحر عن **${target.name}**!`);
            break;
        }

        // --- التضحية ---
        case 'sacrifice_crit': {
            const selfDmg = Math.floor(player.maxHp * 0.10);
            skillDmg = Math.floor(effectiveAtk * (value / 100)) * mult;
            applyDamageToPlayer(player, selfDmg);
            target.hp -= skillDmg;
            player.totalDamage += skillDmg;
            log.push(`👹 **${player.name}** ضحى بدمه (-${selfDmg}) لتوجيه ضربة مدمرة لـ **${target.name}**! (**${skillDmg}** ضرر)`);
            break;
        }

        // --- سرقة الحياة ---
        case 'lifesteal_overheal': {
            skillDmg = Math.floor(effectiveAtk * 1.4) * mult;
            target.hp -= skillDmg;
            player.totalDamage += skillDmg;
            const healVal = Math.floor(skillDmg * 0.5);
            player.hp = Math.min(player.maxHp, player.hp + healVal);
            log.push(`🍷 **${player.name}** امتص دماء **${target.name}**! (${skillDmg} ضرر)`);
            break;
        }
        case 'execute_heal': {
            skillDmg = Math.floor(effectiveAtk * 1.8) * mult;
            if (target.hp - skillDmg <= 0) {
                target.hp = 0;
                player.hp = Math.min(player.maxHp, player.hp + Math.floor(player.maxHp * 0.25));
                log.push(`🥩 **${player.name}** افترس **${target.name}** واستعاد 25% صحة!`);
            } else {
                target.hp -= skillDmg;
                log.push(`🧟 **${player.name}** نهش **${target.name}** بضرر **${skillDmg}**!`);
            }
            player.totalDamage += skillDmg;
            break;
        }

        // --- الضرر النقي ---
        case 'truedmg_burn': {
            skillDmg = Math.floor(effectiveAtk * (value / 100 + 1)) * mult;
            target.hp -= skillDmg;
            player.totalDamage += skillDmg;
            target.effects.push({ type: 'burn', val: Math.floor(effectiveAtk * 0.2), turns: 3 });
            log.push(`🐲 **${player.name}** أحرق **${target.name}** بـ ${skillDmg} ضرر حقيقي!`);
            break;
        }

        // --- Default ---
        default: {
            // الشفاء الافتراضي
            if (skill.id === 'skill_healing' || skill.id === 'skill_cleanse') {
                let healAmount = Math.floor(player.maxHp * (value / 100)) * mult;
                player.hp = Math.min(player.maxHp, player.hp + healAmount);
                log.push(`❤️‍🩹 **${player.name}** استخدم ${skill.name} واستعاد **${healAmount}** HP.`);
            } 
            else if (skill.id === 'skill_shielding') {
                if (player.shield > 0) return { error: 'لديك درع بالفعل!' };
                let shieldAmount = Math.floor(player.maxHp * (value / 100)) * mult;
                player.shield = shieldAmount;
                log.push(`${skill.emoji || '🛡️'} **${player.name}** فعل درعاً بقوة **${shieldAmount}**.`);
            }
            else {
                // هجوم عادي
                let multiplier = (type === '%') ? (1 + (value/100)) : 1;
                skillDmg = Math.floor((effectiveAtk * multiplier) + (type !== '%' ? value : 0)) * mult;
                target.hp -= skillDmg;
                player.totalDamage += skillDmg; 
                log.push(`💥 **${player.name}** ضرب **${target.name}** بـ **${skillDmg}** ضرر!`);
            }
            break;
        }
    }
}

module.exports = { handleSkillUsage };
