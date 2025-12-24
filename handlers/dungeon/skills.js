const { OWNER_ID } = require('./constants');
const { applyDamageToPlayer } = require('./utils');

function handleSkillUsage(player, skill, monster, log, threadChannel, players) {
    let skillDmg = 0;
    const mult = (player.id === OWNER_ID) ? 10 : 1;

    // حساب البفات (Buffs) لزيادة الهجوم
    let atkMultiplier = 1.0;
    if (player.effects) {
        player.effects.forEach(e => { if (e.type === 'atk_buff') atkMultiplier += e.val; });
    }
    const effectiveAtk = Math.floor(player.atk * atkMultiplier);

    // ====================================================
    // 🔥 1. مهارات الأونر الخاصة (الأولوية القصوى) 🔥
    // ====================================================
    
    // مهارة الفخ (Trap)
    if (skill.id === 'skill_owner_trap') {
        log.push(`🕳️ **${player.name}** قام بتفعيل فخ البعد الآخر يدوياً!`);
        return { type: 'force_trap' };
    }

    // مهارة الانتقال الآني (Teleport)
    if (skill.id === 'skill_owner_teleport') {
        return { type: 'open_teleport_modal' };
    }

    // مهارة الضربة القاضية (Secret Owner)
    if (skill.id === 'skill_secret_owner') {
        skillDmg = Math.floor(monster.maxHp * 0.50); 
        monster.hp -= skillDmg;
        player.totalDamage += skillDmg;
        log.push(`👁️ **${player.name}** استخدم "تركيز تام" وقصم الوحش لنصفين! (**${skillDmg}** ضرر)`);
        return;
    }

    // مهارة المغادرة (Leave)
    if (skill.id === 'skill_owner_leave') {
        monster.hp = 1; 
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
         // إرجاع نوع التأثير للملف الرئيسي ليتصرف بناءً عليه
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
    
    // تجهيز القيمة (مع مضاعفة للأونر)
    const value = skill.effectValue || (skill.base_value ? skill.base_value * (player.id === OWNER_ID ? 2 : 1) : 0); 

    // التحقق من الكولداون
    if (!classType && skill.id !== 'skill_secret_owner' && skill.id !== 'skill_owner_leave') {
        if ((player.skillCooldowns[skill.id] || 0) > 0 && player.id !== OWNER_ID) {
            return { error: `⏳ المهارة "${skill.name}" في وقت انتظار (${player.skillCooldowns[skill.id]} جولات)!` };
        }
    }

    // تعيين الكولداون (5 لعرق، 3 للعادي)
    const setCD = (turns = 3) => { if (player.id !== OWNER_ID) player.skillCooldowns[skill.id] = turns; };
    if (skill.id.startsWith('race_')) setCD(5); else setCD(3);

    // 🔥 إصلاح مهارة الروح (Spirit/Evasion) بشكل إجباري 🔥
    if (skill.id === 'race_spirit_skill' || skill.stat_type === 'Dmg_Evasion') {
        skillDmg = Math.floor(effectiveAtk * 1.3) * mult;
        monster.hp -= skillDmg;
        player.totalDamage += skillDmg;
        player.effects.push({ type: 'evasion', val: 1, turns: 1 });
        log.push(`👻 **${player.name}** ضرب واختفى كالشبح! (مراوغة تامة للجولة القادمة)`);
        return; 
    }

    // تحديد نوع المهارة (لتجنب مشاكل الحروف الكبيرة والصغيرة)
    const type = (skill.stat_type || "").toLowerCase();

    // 🔥 Switch لإصلاح المشاكل والتعامل مع الأنواع البسيطة 🔥
    switch (type) {
        // --- الشفاء والتطهير ---
        case 'heal':
        case 'healing':
        case 'cleanse': {
            let healAmount = Math.floor(player.maxHp * (value / 100)) * mult;
            if (type === 'cleanse' || skill.id === 'skill_cleanse') {
                player.effects = []; // إزالة السموم
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
        case 'cleanse_buff_shield': { // دمجت النوع المعقد هنا للتبسيط
            if (player.shield > 0) return { error: 'لديك درع بالفعل!' };
            
            // إذا كان النوع المعقد، نضيف بف هجوم وتطهير أيضاً
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
            monster.effects.push({ type: 'poison', val: Math.floor(effectiveAtk * (value/100)) * mult, turns: 3 });
            monster.hp -= skillDmg;
            player.totalDamage += skillDmg; 
            log.push(`☠️ **${player.name}** سمم الوحش! (ضرر ${skillDmg}).`);
            break;
        }

        // --- الإضعاف (Weaken/Confusion/Stun) ---
        case 'weaken':
        case 'weakness': {
            skillDmg = Math.floor(effectiveAtk * 0.5) * mult;
            monster.effects.push({ type: 'weakness', val: 0.25, turns: 2 }); 
            monster.hp -= skillDmg;
            player.totalDamage += skillDmg; 
            log.push(`📉 **${player.name}** أضعف الوحش وسبب **${skillDmg}** ضرر.`);
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
        case 'stun_vulnerable': {
            skillDmg = Math.floor(effectiveAtk * 1.2) * mult;
            monster.hp -= skillDmg;
            monster.frozen = true;
            monster.effects.push({ type: 'weakness', val: 0.5, turns: 1 });
            player.totalDamage += skillDmg;
            log.push(`🍃 **${player.name}** شل حركة الوحش وجعل دفاعه هشاً! (${skillDmg} ضرر)`);
            break;
        }

        // --- الانعكاس (Reflect) ---
        case 'reflect':
        case 'rebound': 
        case 'reflect_tank': {
            const reflectPercent = (value > 0 ? value / 100 : 0.5) * mult;
            player.effects.push({ type: 'reflect', val: reflectPercent, turns: 1 });
            
            // إضافة ميزة التانك إذا كانت مهارة مركبة
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

        // --- القمار (Gamble) ---
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

        // --- التبديد (Dispel) ---
        case 'dispel': {
            monster.effects = []; 
            log.push(`💨 **${player.name}** بدد السحر عن الوحش!`);
            break;
        }

        // --- التضحية (Sacrifice) ---
        case 'sacrifice_crit': {
            const selfDmg = Math.floor(player.maxHp * 0.10);
            skillDmg = Math.floor(effectiveAtk * (value / 100)) * mult;
            applyDamageToPlayer(player, selfDmg);
            monster.hp -= skillDmg;
            player.totalDamage += skillDmg;
            log.push(`👹 **${player.name}** ضحى بدمه (-${selfDmg}) لتوجيه ضربة مدمرة! (**${skillDmg}** ضرر)`);
            break;
        }

        // --- سرقة الحياة (Lifesteal/Execute) ---
        case 'lifesteal_overheal': {
            skillDmg = Math.floor(effectiveAtk * 1.4) * mult;
            monster.hp -= skillDmg;
            player.totalDamage += skillDmg;
            const healVal = Math.floor(skillDmg * 0.5);
            player.hp = Math.min(player.maxHp, player.hp + healVal);
            log.push(`🍷 **${player.name}** امتص الدماء! (${skillDmg} ضرر)`);
            break;
        }
        case 'execute_heal': {
            skillDmg = Math.floor(effectiveAtk * 1.8) * mult;
            if (monster.hp - skillDmg <= 0) {
                monster.hp = 0;
                player.hp = Math.min(player.maxHp, player.hp + Math.floor(player.maxHp * 0.25));
                log.push(`🥩 **${player.name}** افترس الوحش واستعاد 25% صحة!`);
            } else {
                monster.hp -= skillDmg;
                log.push(`🧟 **${player.name}** نهش الوحش بضرر **${skillDmg}**!`);
            }
            player.totalDamage += skillDmg;
            break;
        }

        // --- مهارات الضرر النقي/الحرق ---
        case 'truedmg_burn': {
            skillDmg = Math.floor(effectiveAtk * (value / 100 + 1)) * mult;
            monster.hp -= skillDmg;
            player.totalDamage += skillDmg;
            monster.effects.push({ type: 'burn', val: Math.floor(effectiveAtk * 0.2), turns: 3 });
            log.push(`🐲 **${player.name}** أطلق ${skill.name} وأحرق الوحش! (${skillDmg} ضرر)`);
            break;
        }

        // --- Default (ضرر عادي) ---
        default: {
            // فحص أخير للتوافق القديم
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
                monster.hp -= skillDmg;
                player.totalDamage += skillDmg; 
                log.push(`💥 **${player.name}** استخدم ${skill.name} بـ **${skillDmg}** ضرر!`);
            }
            break;
        }
    }
}

module.exports = { handleSkillUsage };
