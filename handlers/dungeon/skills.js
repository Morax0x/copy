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

    // --- 1. مهارات المالك الخاصة ---
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

    // --- 2. مهارات الكلاسات (Class Skills) ---
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

    const value = skill.effectValue || (skill.base_value ? skill.base_value * (player.id === OWNER_ID ? 2 : 1) : 0); 

    // التحقق من الكولداون للمهارات العادية
    if (!classType && skill.id !== 'skill_secret_owner' && skill.id !== 'skill_owner_leave') {
        if ((player.skillCooldowns[skill.id] || 0) > 0 && player.id !== OWNER_ID) {
            return { error: `⏳ المهارة "${skill.name}" في وقت انتظار (${player.skillCooldowns[skill.id]} جولات)!` };
        }
    }

    // تعيين الكولداون
    const setCD = (turns = 3) => {
        if (player.id !== OWNER_ID) player.skillCooldowns[skill.id] = turns;
    };

    if (skill.id.startsWith('race_')) {
        setCD(5); 
    } else {
        setCD(3);
    }

    // 🔥🔥🔥 إصلاح مهارة الروح (Spirit) بشكل إجباري 🔥🔥🔥
    // إذا كان اسم المهارة يحتوي على Spirit أو ID الخاص بها هو race_spirit_skill
    if (skill.id === 'race_spirit_skill' || skill.stat_type === 'Dmg_Evasion') {
        skillDmg = Math.floor(effectiveAtk * 1.3) * mult;
        monster.hp -= skillDmg;
        player.totalDamage += skillDmg;
        
        // تفعيل المراوغة (Evasion) لمدة جولة واحدة
        player.effects.push({ type: 'evasion', val: 1, turns: 1 });
        
        log.push(`👻 **${player.name}** ضرب واختفى كالشبح! (مراوغة تامة للجولة القادمة)`);
        return; // الخروج لضمان عدم تنفيذ كود آخر
    }

    // --- 3. بقية أنواع المهارات ---
    switch (skill.stat_type) {
        case 'TrueDMG_Burn': { 
            skillDmg = Math.floor(effectiveAtk * (value / 100 + 1)) * mult;
            monster.hp -= skillDmg;
            player.totalDamage += skillDmg;
            monster.effects.push({ type: 'burn', val: Math.floor(effectiveAtk * 0.2), turns: 3 });
            log.push(`🐲 **${player.name}** أطلق ${skill.name} وأحرق الوحش! (${skillDmg} ضرر)`);
            break;
        }
        case 'Cleanse_Buff_Shield': { 
            player.effects = player.effects.filter(e => e.type === 'buff' || e.type === 'atk_buff'); 
            const shieldVal = Math.floor(player.maxHp * (value / 100));
            player.shield += shieldVal;
            player.effects.push({ type: 'atk_buff', val: 0.2, turns: 2 });
            log.push(`⚔️ **${player.name}** استجمع قواه! (تطهير + درع ${shieldVal} + هجوم)`);
            break;
        }
        case 'Scale_MissingHP_Heal': { 
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
        case 'Sacrifice_Crit': { 
            const selfDmg = Math.floor(player.maxHp * 0.10);
            skillDmg = Math.floor(effectiveAtk * (value / 100)) * mult;
            applyDamageToPlayer(player, selfDmg);
            monster.hp -= skillDmg;
            player.totalDamage += skillDmg;
            log.push(`👹 **${player.name}** ضحى بدمه (-${selfDmg}) لتوجيه ضربة مدمرة! (**${skillDmg}** ضرر)`);
            break;
        }
        case 'Stun_Vulnerable': { 
            skillDmg = Math.floor(effectiveAtk * 1.2) * mult;
            monster.hp -= skillDmg;
            monster.frozen = true; 
            monster.effects.push({ type: 'weakness', val: 0.5, turns: 1 }); 
            player.totalDamage += skillDmg;
            log.push(`🍃 **${player.name}** شل حركة الوحش وجعل دفاعه هشاً! (${skillDmg} ضرر)`);
            break;
        }
        case 'Confusion': { 
            skillDmg = Math.floor(effectiveAtk * 1.2) * mult;
            monster.hp -= skillDmg;
            monster.effects.push({ type: 'confusion', val: 0.5, turns: 2 }); 
            player.totalDamage += skillDmg;
            log.push(`😵 **${player.name}** ألقى لعنة الجنون على الوحش! (${skillDmg} ضرر)`);
            break;
        }
        case 'Lifesteal_Overheal': { 
            skillDmg = Math.floor(effectiveAtk * 1.4) * mult;
            monster.hp -= skillDmg;
            player.totalDamage += skillDmg;
            const healVal = Math.floor(skillDmg * 0.5);
            const missingHp = player.maxHp - player.hp;
            if (healVal > missingHp) {
                player.hp = player.maxHp;
                const overHeal = healVal - missingHp;
                player.shield += Math.floor(overHeal * 0.5);
                log.push(`🍷 **${player.name}** امتص الدماء! (شفاء تام + درع ${Math.floor(overHeal * 0.5)})`);
            } else {
                player.hp += healVal;
                log.push(`🍷 **${player.name}** امتص ${healVal} من الصحة!`);
            }
            break;
        }
        case 'Chaos_RNG': { 
            skillDmg = Math.floor(effectiveAtk * 1.2) * mult;
            monster.hp -= skillDmg;
            player.totalDamage += skillDmg;
            const effects = ['burn', 'weakness', 'confusion', 'blind'];
            const randomEffect = effects[Math.floor(Math.random() * effects.length)];
            
            if (randomEffect === 'burn') monster.effects.push({ type: 'burn', val: Math.floor(effectiveAtk * 0.2), turns: 3 });
            else if (randomEffect === 'weakness') monster.effects.push({ type: 'weakness', val: 0.3, turns: 2 });
            else if (randomEffect === 'confusion') monster.effects.push({ type: 'confusion', val: 0.4, turns: 2 });
            else if (randomEffect === 'blind') monster.effects.push({ type: 'blind', val: 0.5, turns: 2 });

            log.push(`🌀 **${player.name}** أثار الفوضى بتأثير عشوائي (${randomEffect})!`);
            break;
        }
        // حالة Dmg_Evasion موجودة هنا أيضاً كاحتياط للمهارات الأخرى
        case 'Dmg_Evasion': { 
            skillDmg = Math.floor(effectiveAtk * 1.3) * mult;
            monster.hp -= skillDmg;
            player.totalDamage += skillDmg;
            player.effects.push({ type: 'evasion', val: 1, turns: 1 }); 
            log.push(`👻 **${player.name}** ضرب واختفى كالشبح! (مراوغة تامة)`);
            break;
        }
        case 'Reflect_Tank': { 
            const shieldVal = Math.floor(player.maxHp * 0.2);
            player.shield += shieldVal;
            player.effects.push({ type: 'dmg_reduce', val: 0.6, turns: 2 });
            player.effects.push({ type: 'reflect', val: 0.4, turns: 2 }); 
            log.push(`🔨 **${player.name}** تحصن بالجبل! (دفاع عالٍ + عكس الضرر)`);
            break;
        }
        case 'Execute_Heal': { 
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
        
        default: {
            switch (skill.id) {
                case 'skill_rebound': 
                case 'potion_reflect': { 
                     const reflectPercent = (value > 0 ? value / 100 : 0.5) * mult;
                     player.effects.push({ type: 'reflect', val: reflectPercent, turns: 1 });
                     log.push(`🌵 **${player.name}** جهز درع الأشواك (انعكاس)!`);
                     break;
                }
                case 'skill_healing':
                case 'skill_cleanse': {
                    let healAmount = Math.floor(player.maxHp * (value / 100)) * mult;
                    if (skill.id === 'skill_cleanse') {
                        player.effects = []; 
                        log.push(`✨ **${player.name}** تطهر وشفى **${healAmount}** HP.`);
                    } else {
                        log.push(`❤️‍🩹 **${player.name}** استخدم ${skill.name} واستعاد **${healAmount}** HP.`);
                    }
                    player.hp = Math.min(player.maxHp, player.hp + healAmount);
                    break;
                }
                case 'skill_shielding': {
                     if (player.shield > 0) return { error: 'لديك درع بالفعل!' };
                     let shieldAmount = Math.floor(player.maxHp * (value / 100)) * mult;
                     player.shield = shieldAmount; 
                     log.push(`${skill.emoji} **${player.name}** فعل درعاً بقوة **${shieldAmount}**.`);
                     break;
                }
                case 'skill_buffing': {
                     player.effects.push({ type: 'atk_buff', val: (value / 100) * mult, turns: 3 });
                     log.push(`💪 **${player.name}** رفع قوته الهجومية!`);
                     break;
                }
                case 'skill_poison': {
                     skillDmg = Math.floor(effectiveAtk * 0.5) * mult; 
                     monster.effects.push({ type: 'poison', val: Math.floor(effectiveAtk * (value/100)) * mult, turns: 3 });
                     monster.hp -= skillDmg;
                     player.totalDamage += skillDmg; 
                     log.push(`☠️ **${player.name}** سمم الوحش! (ضرر ${skillDmg}).`);
                     break;
                }
                case 'skill_gamble': {
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
                case 'skill_weaken': {
                     skillDmg = Math.floor(effectiveAtk * 0.5) * mult;
                     monster.effects.push({ type: 'weakness', val: 0.25, turns: 2 }); 
                     monster.hp -= skillDmg;
                     player.totalDamage += skillDmg; 
                     log.push(`📉 **${player.name}** أضعف الوحش وسبب **${skillDmg}** ضرر.`);
                     break;
                }
                case 'skill_dispel': {
                    monster.effects = []; 
                    log.push(`💨 **${player.name}** بدد السحر!`);
                    break;
                }
                default: {
                    let multiplier = skill.stat_type === '%' ? (1 + (value/100)) : 1;
                    skillDmg = Math.floor((effectiveAtk * multiplier) + (skill.stat_type !== '%' ? value : 0)) * mult;
                    monster.hp -= skillDmg;
                    player.totalDamage += skillDmg; 
                    log.push(`💥 **${player.name}** استخدم ${skill.name} بـ **${skillDmg}** ضرر!`);
                    break;
                }
            }
            break;
        }
    }
}

module.exports = { handleSkillUsage };
