const { OWNER_ID } = require('./constants');
const { applyDamageToPlayer } = require('./utils');

// دالة تحديد الهدف
function getSkillTarget(monster, subMonster) {
    if (!subMonster || subMonster.hp <= 0) return monster;
    if (monster.hp <= 0) return subMonster;
    return Math.random() < 0.5 ? subMonster : monster;
}

function handleSkillUsage(player, skill, monster, subMonster, log, threadChannel, players) {
    let skillDmg = 0;
    const mult = (player.id === OWNER_ID) ? 10 : 1;
    const target = getSkillTarget(monster, subMonster);

    let atkMultiplier = 1.0;
    if (player.effects) {
        player.effects.forEach(e => { if (e.type === 'atk_buff') atkMultiplier += e.val; });
    }
    const effectiveAtk = Math.floor(player.atk * atkMultiplier);

    // ====================================================
    // 🔥 1. مهارات الأونر (Owner Skills) 🔥
    // ====================================================
    
    // قتل فوري
    if (skill.id === 'skill_owner_kill') {
        target.hp = 0;
        log.push(`⚡ **${player.name}** استخدم "القتل الفوري" ومحى وجود **${target.name}**!`);
        return;
    }
    // فخ
    if (skill.id === 'skill_owner_trap') {
        log.push(`🕳️ **${player.name}** قام بتفعيل فخ البعد الآخر يدوياً!`);
        return { type: 'force_trap' };
    }
    // انتقال
    if (skill.id === 'skill_owner_teleport') {
        return { type: 'open_teleport_modal' };
    }
    // تركيز تام
    if (skill.id === 'skill_secret_owner') {
        skillDmg = Math.floor(target.maxHp * 0.50); 
        target.hp -= skillDmg;
        player.totalDamage += skillDmg;
        log.push(`👁️ **${player.name}** استخدم "تركيز تام" وقصم **${target.name}**! (**${skillDmg}** ضرر)`);
        return;
    }
    // مغادرة
    if (skill.id === 'skill_owner_leave') {
        monster.hp = 1; 
        if(subMonster) subMonster.hp = 0;
        log.push(`🚪 **${player.name}** غادر بلمح البصر!`);
        if (threadChannel) threadChannel.send(`🚪 **${player.name}** غادر الدانجون!`).catch(()=>{});
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
         if (player.special_cooldown > 0 && player.id !== OWNER_ID) return { error: `⏳ كولداون!` }; 
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
    // 3. المهارات العادية والعرقية (حسب IDs ملف JSON)
    // ====================================================
    
    const value = skill.effectValue || (skill.base_value ? skill.base_value * (player.id === OWNER_ID ? 2 : 1) : 0); 

    // كولداون
    if (!classType && skill.id !== 'skill_secret_owner' && skill.id !== 'skill_owner_leave' && skill.id !== 'skill_owner_kill') {
        if ((player.skillCooldowns[skill.id] || 0) > 0 && player.id !== OWNER_ID) {
            return { error: `⏳ مهارة "${skill.name}" في انتظار!` };
        }
        const cd = skill.cooldown || (skill.id.startsWith('race_') ? 5 : 3);
        if (player.id !== OWNER_ID) player.skillCooldowns[skill.id] = cd;
    }

    // 🔥🔥🔥 تطبيق المهارات بدقة حسب الـ ID 🔥🔥🔥

    switch (skill.id) {
        // --- مهارات الشفاء والحماية ---
        case 'skill_healing': {
            let heal = Math.floor(player.maxHp * (value / 100)) * mult;
            player.hp = Math.min(player.maxHp, player.hp + heal);
            log.push(`❤️‍🩹 **${player.name}** استخدم ${skill.name} واستعاد **${heal}** HP.`);
            break;
        }
        case 'skill_shielding': {
            if (player.shield > 0) return { error: 'لديك درع بالفعل!' };
            player.shield = Math.floor(player.maxHp * (value / 100)) * mult;
            log.push(`🛡️ **${player.name}** فعل درعاً بقوة **${player.shield}**.`);
            break;
        }
        case 'skill_buffing': {
            player.effects.push({ type: 'atk_buff', val: (value / 100) * mult, turns: 3 });
            log.push(`💪 **${player.name}** رفع قوته الهجومية!`);
            break;
        }
        case 'skill_rebound': {
            player.effects.push({ type: 'reflect', val: (value / 100) * mult, turns: 1 }); // قيمة الارتداد
            log.push(`🔄 **${player.name}** فعل الارتداد العكسي!`);
            break;
        }
        case 'skill_cleanse': {
            let heal = Math.floor(player.maxHp * (value / 100)) * mult;
            player.effects = [];
            player.hp = Math.min(player.maxHp, player.hp + heal);
            log.push(`✨ **${player.name}** تطهر وشفى **${heal}** HP.`);
            break;
        }

        // --- مهارات التأثير السلبي ---
        case 'skill_weaken': {
            skillDmg = Math.floor(effectiveAtk * 0.5) * mult;
            target.hp -= skillDmg;
            player.totalDamage += skillDmg;
            target.effects.push({ type: 'weakness', val: 0.25, turns: 2 });
            log.push(`📉 **${player.name}** أضعف **${target.name}** وسبب ضرر بسيط.`);
            break;
        }
        case 'skill_dispel': {
            target.effects = [];
            log.push(`💨 **${player.name}** بدد سحر **${target.name}**!`);
            break;
        }
        case 'skill_poison': {
            skillDmg = Math.floor(effectiveAtk * 0.5) * mult;
            target.hp -= skillDmg;
            player.totalDamage += skillDmg;
            target.effects.push({ type: 'poison', val: Math.floor(effectiveAtk * (value/100)), turns: 3 });
            log.push(`☠️ **${player.name}** سمم **${target.name}**!`);
            break;
        }
        case 'skill_gamble': {
            const success = Math.random() < 0.5;
            if (success) {
                skillDmg = Math.floor(effectiveAtk * 1.5) * mult;
                log.push(`🎲 **${player.name}** نجح في المقامرة! ضربة هائلة!`);
            } else {
                skillDmg = 0;
                applyDamageToPlayer(player, Math.floor(player.maxHp * 0.25));
                log.push(`🎲 **${player.name}** خسر المقامرة وتأذى!`);
            }
            if (skillDmg > 0) { target.hp -= skillDmg; player.totalDamage += skillDmg; }
            break;
        }

        // --- مهارات الأعراق ---
        case 'race_dragon_skill': { // TrueDMG_Burn
            skillDmg = Math.floor(effectiveAtk * (value / 100 + 1)) * mult;
            target.hp -= skillDmg;
            player.totalDamage += skillDmg;
            target.effects.push({ type: 'burn', val: Math.floor(effectiveAtk * 0.2), turns: 3 });
            log.push(`🐲 **${player.name}** أحرق **${target.name}** بضرر حقيقي!`);
            break;
        }
        case 'race_human_skill': { // Cleanse_Buff_Shield
            player.effects = player.effects.filter(e => e.type === 'buff');
            player.shield += Math.floor(player.maxHp * (value / 100));
            player.effects.push({ type: 'atk_buff', val: 0.2, turns: 2 });
            log.push(`🛡️ **${player.name}** (بشري) تطهر، تدرع، وزاد هجومه!`);
            break;
        }
        case 'race_seraphim_skill': { // Scale_MissingHP_Heal
            const missing = (player.maxHp - player.hp) / player.maxHp;
            skillDmg = Math.floor(effectiveAtk * 1.2 + (effectiveAtk * missing * 2)) * mult;
            target.hp -= skillDmg;
            player.hp = Math.min(player.maxHp, player.hp + Math.floor(player.maxHp * 0.15));
            player.totalDamage += skillDmg;
            log.push(`✨ **${player.name}** عاقب وشفى نفسه!`);
            break;
        }
        case 'race_demon_skill': { // Sacrifice_Crit
            applyDamageToPlayer(player, Math.floor(player.maxHp * 0.1));
            skillDmg = Math.floor(effectiveAtk * (value / 100)) * mult; 
            target.hp -= skillDmg;
            player.totalDamage += skillDmg;
            log.push(`🩸 **${player.name}** ضحى بدمه لضربة مدمرة!`);
            break;
        }
        case 'race_elf_skill': { // Stun_Vulnerable
            skillDmg = Math.floor(effectiveAtk * 1.2) * mult;
            target.hp -= skillDmg;
            target.frozen = true;
            target.effects.push({ type: 'weakness', val: 0.5, turns: 1 });
            player.totalDamage += skillDmg;
            log.push(`🏹 **${player.name}** شل حركة **${target.name}**!`);
            break;
        }
        case 'race_dark_elf_skill': { // Confusion
            skillDmg = Math.floor(effectiveAtk * 1.2) * mult;
            target.hp -= skillDmg;
            target.effects.push({ type: 'confusion', val: 0.5, turns: 2 });
            player.totalDamage += skillDmg;
            log.push(`🗡️ **${player.name}** أربك **${target.name}**!`);
            break;
        }
        case 'race_vampire_skill': { // Lifesteal_Overheal
            skillDmg = Math.floor(effectiveAtk * 1.4) * mult;
            target.hp -= skillDmg;
            player.totalDamage += skillDmg;
            const heal = Math.floor(skillDmg * 0.5);
            const missing = player.maxHp - player.hp;
            if (heal > missing) {
                player.hp = player.maxHp;
                player.shield += Math.floor((heal - missing) * 0.5);
                log.push(`🦇 **${player.name}** امتص دماء وحول الفائض لدرع!`);
            } else {
                player.hp += heal;
                log.push(`🦇 **${player.name}** امتص دماء!`);
            }
            break;
        }
        case 'race_hybrid_skill': { // Chaos_RNG
            skillDmg = Math.floor(effectiveAtk * 1.2) * mult;
            target.hp -= skillDmg;
            player.totalDamage += skillDmg;
            const effs = ['burn', 'weakness', 'confusion', 'blind'];
            const rnd = effs[Math.floor(Math.random() * effs.length)];
            target.effects.push({ type: rnd, val: 0.3, turns: 2 });
            log.push(`🌀 **${player.name}** سبب ضرراً وفوضى (${rnd})!`);
            break;
        }
        case 'race_spirit_skill': { // Dmg_Evasion
            skillDmg = Math.floor(effectiveAtk * 1.3) * mult;
            target.hp -= skillDmg;
            player.totalDamage += skillDmg;
            player.effects.push({ type: 'evasion', val: 1, turns: 1 });
            log.push(`👻 **${player.name}** ضرب واختفى (مراوغة)!`);
            break;
        }
        case 'race_dwarf_skill': { // Reflect_Tank
            player.shield += Math.floor(player.maxHp * 0.2);
            player.effects.push({ type: 'dmg_reduce', val: 0.6, turns: 2 });
            player.effects.push({ type: 'reflect', val: 0.4, turns: 2 });
            log.push(`🛡️ **${player.name}** (قزم) تحصن بالترس!`);
            break;
        }
        case 'race_ghoul_skill': { // Execute_Heal
            skillDmg = Math.floor(effectiveAtk * 1.8) * mult;
            if (target.hp - skillDmg <= 0) {
                target.hp = 0;
                player.hp = Math.min(player.maxHp, player.hp + Math.floor(player.maxHp * 0.25));
                log.push(`🧟 **${player.name}** افترس **${target.name}** واستعاد صحة!`);
            } else {
                target.hp -= skillDmg;
                log.push(`🧟 **${player.name}** هاجم بوحشية!`);
            }
            player.totalDamage += skillDmg;
            break;
        }

        default: {
            // أي مهارة أخرى غير معرفة تعتبر هجوم
            let m = (skill.stat_type === '%') ? (1 + (value/100)) : 1;
            skillDmg = Math.floor((effectiveAtk * m) + (skill.stat_type !== '%' ? value : 0)) * mult;
            target.hp -= skillDmg;
            player.totalDamage += skillDmg;
            log.push(`💥 **${player.name}** استخدم ${skill.name} بضرر **${skillDmg}**!`);
            break;
        }
    }
}

module.exports = { handleSkillUsage };
