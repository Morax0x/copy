const { OWNER_ID } = require('./constants');
const { applyDamageToPlayer } = require('./utils');

function handleSkillUsage(player, skill, monster, log, threadChannel, players) {
    let skillDmg = 0;
    const mult = (player.id === OWNER_ID) ? 10 : 1;

    // حساب البفات (Buffs)
    let atkMultiplier = 1.0;
    if (player.effects) {
        player.effects.forEach(e => { if (e.type === 'atk_buff') atkMultiplier += e.val; });
    }
    const effectiveAtk = Math.floor(player.atk * atkMultiplier);

    // 🔥 1. مهارات الأونر الخاصة (الفخ والانتقال)
    if (skill.id === 'skill_owner_trap') {
        log.push(`🕳️ **${player.name}** قام بتفعيل فخ البعد الآخر يدوياً!`);
        return { type: 'force_trap' };
    }
    if (skill.id === 'skill_owner_teleport') {
        return { type: 'open_teleport_modal' };
    }
    if (skill.id === 'skill_secret_owner') {
        skillDmg = Math.floor(monster.maxHp * 0.50); 
        monster.hp -= skillDmg;
        player.totalDamage += skillDmg;
        log.push(`👁️ **${player.name}** استخدم "تركيز تام" وقصم الوحش لنصفين! (**${skillDmg}** ضرر)`);
        return;
    }
    if (skill.id === 'skill_owner_leave') {
        monster.hp = 1; 
        log.push(`🚪 **${player.name}** غادر بلمح البصر، وترك الوحش يترنح (HP: 1)!`);
        if (threadChannel) threadChannel.send(`🚪 **${player.name}** غادر الدانجون بلمح البصر!`).catch(()=>{});
        return { type: 'owner_leave' };
    }

    // 🔥 2. مهارات الكلاسات (Class Skills)
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

    // تجهيز قيمة التأثير
    const value = skill.effectValue || (skill.base_value ? skill.base_value * (player.id === OWNER_ID ? 2 : 1) : 0); 

    // التحقق من الكولداون للمهارات العادية
    if (!classType && skill.id !== 'skill_secret_owner' && skill.id !== 'skill_owner_leave') {
        if ((player.skillCooldowns[skill.id] || 0) > 0 && player.id !== OWNER_ID) {
            return { error: `⏳ المهارة "${skill.name}" في وقت انتظار (${player.skillCooldowns[skill.id]} جولات)!` };
        }
    }

    // تعيين الكولداون
    const setCD = (turns = 3) => { if (player.id !== OWNER_ID) player.skillCooldowns[skill.id] = turns; };
    if (skill.id.startsWith('race_')) setCD(5); else setCD(3);

    // إصلاح مهارة الروح (Spirit)
    if (skill.id === 'race_spirit_skill' || skill.stat_type === 'Dmg_Evasion') {
        skillDmg = Math.floor(effectiveAtk * 1.3) * mult;
        monster.hp -= skillDmg;
        player.totalDamage += skillDmg;
        player.effects.push({ type: 'evasion', val: 1, turns: 1 });
        log.push(`👻 **${player.name}** ضرب واختفى كالشبح! (مراوغة تامة للجولة القادمة)`);
        return; 
    }

    // 🔥🔥🔥 3. الـ Switch الرئيسي (تم إضافة الأنواع البسيطة هنا) 🔥🔥🔥
    // نقوم بتوحيد حالة الأحرف لتجنب الأخطاء (Lower Case)
    const type = (skill.stat_type || "").toLowerCase();

    switch (type) {
        // --- أنواع الشفاء ---
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

        // --- أنواع الدروع ---
        case 'shield':
        case 'shielding': {
            if (player.shield > 0) return { error: 'لديك درع بالفعل!' };
            let shieldAmount = Math.floor(player.maxHp * (value / 100)) * mult;
            player.shield = shieldAmount; 
            log.push(`${skill.emoji || '🛡️'} **${player.name}** فعل درعاً بقوة **${shieldAmount}**.`);
            break;
        }

        // --- أنواع البفات (Buffs) ---
        case 'buff':
        case 'atk_buff':
        case 'buffing': {
            player.effects.push({ type: 'atk_buff', val: (value / 100) * mult, turns: 3 });
            log.push(`💪 **${player.name}** رفع قوته الهجومية!`);
            break;
        }

        // --- أنواع الديبف (Debuffs) ---
        case 'poison': {
            skillDmg = Math.floor(effectiveAtk * 0.5) * mult; 
            monster.effects.push({ type: 'poison', val: Math.floor(effectiveAtk * (value/100)) * mult, turns: 3 });
            monster.hp -= skillDmg;
            player.totalDamage += skillDmg; 
            log.push(`☠️ **${player.name}** سمم الوحش! (ضرر ${skillDmg}).`);
            break;
        }
        case 'weaken':
        case 'weakness': {
            skillDmg = Math.floor(effectiveAtk * 0.5) * mult;
            monster.effects.push({ type: 'weakness', val: 0.25, turns: 2 }); 
            monster.hp -= skillDmg;
            player.totalDamage += skillDmg; 
            log.push(`📉 **${player.name}** أضعف الوحش وسبب **${skillDmg}** ضرر.`);
            break;
        }
        case 'dispel': {
            monster.effects = []; 
            log.push(`💨 **${player.name}** بدد السحر عن الوحش!`);
            break;
        }

        // --- أنواع خاصة أخرى ---
        case 'reflect':
        case 'rebound': {
            const reflectPercent = (value > 0 ? value / 100 : 0.5) * mult;
            player.effects.push({ type: 'reflect', val: reflectPercent, turns: 1 });
            log.push(`🌵 **${player.name}** جهز درع الأشواك (انعكاس)!`);
            break;
        }
        case 'gamble': {
            const isSuccess = Math.random() < 0.5; 
            if (isSuccess) {
                const bonusDmg = Math.floor(Math.random() * (250 - 80 + 1)) + 80;
                skillDmg = (effectiveAtk + bonusDmg) * mult; 
                log.push(`🎲 **${player.name}** خاطر ونجح! سدد ضربة قوية بمقدار **${skillDmg}**!`);
            } else {
                const selfDamage = Math.floor(Math.random() * (30 - 10 + 1)) + 10;
                skillDmg = 0;
                applyDamageToPlayer(player, selfDamage);
                log.push(`🎲 **${player.name}** خسر الرهان! وانفجرت النردات مسببة **${selfDamage}** ضرر!`);
            }
            if (skillDmg > 0) {
               monster.hp -= skillDmg;
               player.totalDamage += skillDmg; 
            }
            break;
        }

        // --- الأنواع المعقدة (كما هي) ---
        case 'truedmg_burn': { 
            skillDmg = Math.floor(effectiveAtk * (value / 100 + 1)) * mult;
            monster.hp -= skillDmg;
            player.totalDamage += skillDmg;
            monster.effects.push({ type: 'burn', val: Math.floor(effectiveAtk * 0.2), turns: 3 });
            log.push(`🐲 **${player.name}** أطلق ${skill.name} وأحرق الوحش! (${skillDmg} ضرر)`);
            break;
        }
        case 'cleanse_buff_shield': { 
            player.effects = player.effects.filter(e => e.type === 'buff' || e.type === 'atk_buff'); 
            const shieldVal = Math.floor(player.maxHp * (value / 100));
            player.shield += shieldVal;
            player.effects.push({ type: 'atk_buff', val: 0.2, turns: 2 });
            log.push(`⚔️ **${player.name}** استجمع قواه! (تطهير + درع ${shieldVal} + هجوم)`);
            break;
        }
        case 'scale_missinghp_heal': { 
            const missingHpPercent = (player.maxHp - player.hp) / player.maxHp;
            const extraDmg = Math.floor(effectiveAtk * missingHpPercent * 2);
            skillDmg = (Math.floor(effectiveAtk * 1.2) + extraDmg) * mult;
            const healVal = Math.floor(player.maxHp * 0.15);
            monster.hp -= skillDmg;
            player.hp = Math.min(player.maxHp, player.hp + healVal);
            player.totalDamage += skillDmg;
            log.push(`⚖️ **${player.name}** عاقب الوحش وشفى نفسه! (${skillDmg} ضرر / +${healVal} HP)`);
            break;
        }
        case 'stun_vulnerable': { 
            skillDmg = Math.floor(effectiveAtk * 1.2) * mult;
            monster.hp -= skillDmg;
            monster.frozen = true; 
            monster.effects.push({ type: 'weakness', val: 0.5, turns: 1 }); 
            player.totalDamage += skillDmg;
            log.push(`🍃 **${player.name}** شل حركة الوحش وجعل دفاعه هشاً! (${skillDmg} ضرر)`);
            break;
        }
        case 'confusion': { 
            skillDmg = Math.floor(effectiveAtk * 1.2) * mult;
            monster.hp -= skillDmg;
            monster.effects.push({ type: 'confusion', val: 0.5, turns: 2 }); 
            player.totalDamage += skillDmg;
            log.push(`😵 **${player.name}** ألقى لعنة الجنون على الوحش! (${skillDmg} ضرر)`);
            break;
        }
        case 'reflect_tank': { 
            const shieldVal = Math.floor(player.maxHp * 0.2);
            player.shield += shieldVal;
            player.effects.push({ type: 'dmg_reduce', val: 0.6, turns: 2 });
            player.effects.push({ type: 'reflect', val: 0.4, turns: 2 }); 
            log.push(`🔨 **${player.name}** تحصن بالجبل! (دفاع عالٍ + عكس الضرر)`);
            break;
        }
        
        // --- الحالة الافتراضية (ضرر عادي) ---
        default: {
            // فحص أخير باستخدام ID (للتوافق مع القديم)
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
                // إذا لم يطابق أي شيء، يعتبر هجوم ضرر
                let multiplier = (type === '%') ? (1 + (value/100)) : 1;
                skillDmg = Math.floor((effectiveAtk * multiplier) + (type !== '%' ? value : 0)) * mult;
                monster.hp -= skillDmg;
                player.totalDamage += skillDmg; 
                log.push(`💥 **${player.name}** استخدم ${skill.name} بـ **${skillDmg}** ضرر!`);
            }
            break;
        }
    }
}

module.exports = { handleSkillUsage };
