const { OWNER_ID } = require('./constants');
const { applyDamageToPlayer } = require('./utils');

// دالة تحديد الهدف (الزعيم أو المساعد)
function getSkillTarget(monster, subMonster) {
    if (!subMonster || subMonster.hp <= 0) return monster;
    if (monster.hp <= 0) return subMonster;
    return Math.random() < 0.5 ? subMonster : monster;
}

function handleSkillUsage(player, skill, monster, subMonster, log, threadChannel, players) {
    let skillDmg = 0;
    const mult = (player.id === OWNER_ID) ? 10 : 1;
    
    // تحديد الهدف تلقائياً
    const target = getSkillTarget(monster, subMonster);

    // حساب البفات
    let atkMultiplier = 1.0;
    if (player.effects) {
        player.effects.forEach(e => { if (e.type === 'atk_buff') atkMultiplier += e.val; });
    }
    const effectiveAtk = Math.floor(player.atk * atkMultiplier);

    // ====================================================
    // 🔥 1. مهارات الأونر (الأولوية القصوى) 🔥
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
        log.push(`👁️ **${player.name}** استخدم "تركيز تام" وقصم **${target.name}**! (**${skillDmg}** ضرر)`);
        return;
    }
    if (skill.id === 'skill_owner_leave') {
        monster.hp = 1; 
        if(subMonster) subMonster.hp = 0;
        log.push(`🚪 **${player.name}** غادر بلمح البصر، وترك الوحش يترنح!`);
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
    // 3. معالجة المهارات العادية (حسب ملف JSON)
    // ====================================================
    
    // القيمة الأساسية للمهارة
    const value = skill.effectValue || (skill.base_value ? skill.base_value * (player.id === OWNER_ID ? 2 : 1) : 0); 

    // الكولداون
    if (!classType && skill.id !== 'skill_secret_owner' && skill.id !== 'skill_owner_leave') {
        if ((player.skillCooldowns[skill.id] || 0) > 0 && player.id !== OWNER_ID) {
            return { error: `⏳ المهارة "${skill.name}" في وقت انتظار (${player.skillCooldowns[skill.id]} جولات)!` };
        }
        // تعيين الكولداون
        const cooldownTurns = skill.cooldown || (skill.id.startsWith('race_') ? 5 : 3);
        if (player.id !== OWNER_ID) player.skillCooldowns[skill.id] = cooldownTurns;
    }

    // 🔥🔥 الفحص الدقيق بناءً على ID المهارة (لأن النوع % مشترك) 🔥🔥

    // 1. الشفاء (Healing / Cleanse)
    if (skill.id === 'skill_healing' || skill.id === 'skill_cleanse') {
        let healAmount = Math.floor(player.maxHp * (value / 100)) * mult;
        if (skill.id === 'skill_cleanse') {
            player.effects = []; 
            log.push(`✨ **${player.name}** تطهر وشفى **${healAmount}** HP.`);
        } else {
            log.push(`❤️‍🩹 **${player.name}** استخدم ${skill.name} واستعاد **${healAmount}** HP.`);
        }
        player.hp = Math.min(player.maxHp, player.hp + healAmount);
        return;
    }

    // 2. الدرع (Shielding)
    if (skill.id === 'skill_shielding') {
        if (player.shield > 0) return { error: 'لديك درع بالفعل!' };
        let shieldAmount = Math.floor(player.maxHp * (value / 100)) * mult;
        player.shield = shieldAmount; 
        log.push(`${skill.emoji || '🛡️'} **${player.name}** فعل درعاً بقوة **${shieldAmount}**.`);
        return;
    }

    // 3. البف (Buffing)
    if (skill.id === 'skill_buffing') {
        player.effects.push({ type: 'atk_buff', val: (value / 100) * mult, turns: 3 });
        log.push(`💪 **${player.name}** رفع قوته الهجومية!`);
        return;
    }

    // 4. الانعكاس (Rebound)
    if (skill.id === 'skill_rebound') {
        const reflectPercent = (value > 0 ? value / 100 : 0.5) * mult;
        player.effects.push({ type: 'reflect', val: reflectPercent, turns: 1 });
        log.push(`🔄 **${player.name}** جهز وضعية الارتداد العكسي!`);
        return;
    }

    // 5. الإضعاف (Weaken)
    if (skill.id === 'skill_weaken') {
        skillDmg = Math.floor(effectiveAtk * 0.5) * mult;
        target.hp -= skillDmg;
        player.totalDamage += skillDmg;
        target.effects.push({ type: 'weakness', val: 0.25, turns: 2 }); 
        log.push(`📉 **${player.name}** أضعف **${target.name}** وسبب **${skillDmg}** ضرر.`);
        return;
    }

    // 6. التبديد (Dispel)
    if (skill.id === 'skill_dispel') {
        target.effects = []; 
        log.push(`💨 **${player.name}** بدد السحر عن **${target.name}**!`);
        return;
    }

    // 7. السم (Poison)
    if (skill.id === 'skill_poison') {
        skillDmg = Math.floor(effectiveAtk * 0.5) * mult; 
        target.hp -= skillDmg;
        player.totalDamage += skillDmg;
        target.effects.push({ type: 'poison', val: Math.floor(effectiveAtk * (value/100)) * mult, turns: 3 });
        log.push(`☠️ **${player.name}** سمم **${target.name}**! (ضرر ${skillDmg}).`);
        return;
    }

    // 8. القمار (Gamble)
    if (skill.id === 'skill_gamble') {
        const isSuccess = Math.random() < 0.5; 
        if (isSuccess) {
            const bonusDmg = Math.floor(effectiveAtk * 1.5) * mult;
            skillDmg = bonusDmg;
            log.push(`🎲 **${player.name}** خاطر ونجح! سدد ضربة مدمرة بمقدار **${skillDmg}**!`);
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

    // ====================================================
    // 4. مهارات الأعراق (Race Skills from Config)
    // ====================================================
    const statType = (skill.stat_type || "").toLowerCase();

    switch (statType) {
        case 'truedmg_burn':
            skillDmg = Math.floor(effectiveAtk * (value / 100 + 1)) * mult;
            target.hp -= skillDmg;
            player.totalDamage += skillDmg;
            target.effects.push({ type: 'burn', val: Math.floor(effectiveAtk * 0.2), turns: 3 });
            log.push(`🐲 **${player.name}** أحرق **${target.name}** بـ ${skillDmg} ضرر حقيقي!`);
            break;

        case 'cleanse_buff_shield':
            player.effects = player.effects.filter(e => e.type === 'buff' || e.type === 'atk_buff'); 
            const shieldVal = Math.floor(player.maxHp * (value / 100));
            player.shield += shieldVal;
            player.effects.push({ type: 'atk_buff', val: 0.2, turns: 2 });
            log.push(`🛡️ **${player.name}** استخدم تكتيك القائد! (تطهير + درع + هجوم)`);
            break;

        case 'scale_missinghp_heal':
            const missingHpPercent = (player.maxHp - player.hp) / player.maxHp;
            const extraDmg = Math.floor(effectiveAtk * missingHpPercent * 2);
            skillDmg = (Math.floor(effectiveAtk * 1.2) + extraDmg) * mult;
            const healVal = Math.floor(player.maxHp * 0.15);
            target.hp -= skillDmg;
            player.hp = Math.min(player.maxHp, player.hp + healVal);
            player.totalDamage += skillDmg;
            log.push(`✨ **${player.name}** عاقب الوحش وشفى نفسه! (${skillDmg} ضرر)`);
            break;

        case 'sacrifice_crit':
            const selfDmg = Math.floor(player.maxHp * 0.10);
            skillDmg = Math.floor(effectiveAtk * (value / 100)) * mult;
            applyDamageToPlayer(player, selfDmg);
            target.hp -= skillDmg;
            player.totalDamage += skillDmg;
            log.push(`🩸 **${player.name}** ضحى بدمه لتوجيه ضربة مدمرة! (**${skillDmg}** ضرر)`);
            break;

        case 'stun_vulnerable':
            skillDmg = Math.floor(effectiveAtk * 1.2) * mult;
            target.hp -= skillDmg;
            target.frozen = true; 
            target.effects.push({ type: 'weakness', val: 0.5, turns: 1 }); 
            player.totalDamage += skillDmg;
            log.push(`🏹 **${player.name}** شل حركة **${target.name}**! (${skillDmg} ضرر)`);
            break;

        case 'confusion':
            skillDmg = Math.floor(effectiveAtk * 1.2) * mult;
            target.hp -= skillDmg;
            target.effects.push({ type: 'confusion', val: 0.5, turns: 2 }); 
            player.totalDamage += skillDmg;
            log.push(`🗡️ **${player.name}** أربك **${target.name}**! (${skillDmg} ضرر)`);
            break;

        case 'lifesteal_overheal':
            skillDmg = Math.floor(effectiveAtk * 1.4) * mult;
            target.hp -= skillDmg;
            player.totalDamage += skillDmg;
            const lsHeal = Math.floor(skillDmg * 0.5);
            const missingHp = player.maxHp - player.hp;
            if (lsHeal > missingHp) {
                player.hp = player.maxHp;
                player.shield += Math.floor((lsHeal - missingHp) * 0.5);
                log.push(`🦇 **${player.name}** امتص الدماء وحول الفائض لدرع!`);
            } else {
                player.hp += lsHeal;
                log.push(`🦇 **${player.name}** امتص الدماء!`);
            }
            break;

        case 'chaos_rng':
            skillDmg = Math.floor(effectiveAtk * 1.2) * mult;
            target.hp -= skillDmg;
            player.totalDamage += skillDmg;
            const effects = ['burn', 'weakness', 'confusion', 'blind'];
            const randomEffect = effects[Math.floor(Math.random() * effects.length)];
            target.effects.push({ type: randomEffect, val: 0.3, turns: 2 });
            log.push(`🌀 **${player.name}** أثار الفوضى (${randomEffect})!`);
            break;

        case 'dmg_evasion': // Spirit Skill
            skillDmg = Math.floor(effectiveAtk * 1.3) * mult;
            target.hp -= skillDmg;
            player.totalDamage += skillDmg;
            player.effects.push({ type: 'evasion', val: 1, turns: 1 }); 
            log.push(`👻 **${player.name}** ضرب واختفى كالشبح! (مراوغة تامة)`);
            break;

        case 'reflect_tank':
            const tankShield = Math.floor(player.maxHp * 0.2);
            player.shield += tankShield;
            player.effects.push({ type: 'dmg_reduce', val: 0.6, turns: 2 });
            player.effects.push({ type: 'reflect', val: 0.4, turns: 2 }); 
            log.push(`🛡️ **${player.name}** فعل وضعية الترس (تحصن + عكس)!`);
            break;

        case 'execute_heal':
            skillDmg = Math.floor(effectiveAtk * 1.8) * mult;
            if (target.hp - skillDmg <= 0) {
                target.hp = 0;
                player.hp = Math.min(player.maxHp, player.hp + Math.floor(player.maxHp * 0.25));
                log.push(`🧟 **${player.name}** افترس **${target.name}** بهيجان!`);
            } else {
                target.hp -= skillDmg;
                log.push(`🧟 **${player.name}** هاجم بوحشية! (${skillDmg} ضرر)`);
            }
            player.totalDamage += skillDmg;
            break;

        default:
            // أي شيء آخر (مثل stat_type: "%" الذي ليس شفاء أو درع) يعتبر ضرر
            let multiplier = (statType === '%') ? (1 + (value/100)) : 1;
            skillDmg = Math.floor((effectiveAtk * multiplier) + (statType !== '%' ? value : 0)) * mult;
            target.hp -= skillDmg;
            player.totalDamage += skillDmg; 
            log.push(`💥 **${player.name}** استخدم ${skill.name} بـ **${skillDmg}** ضرر!`);
            break;
    }
}

module.exports = { handleSkillUsage };
