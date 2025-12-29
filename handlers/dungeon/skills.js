const { OWNER_ID, skillsConfig } = require('./constants');
const { applyDamageToPlayer } = require('./utils');

function handleSkillUsage(player, skill, monster, log, threadChannel, players) {
    let skillDmg = 0;
    // مضاعف للأونر للمهارات العادية فقط (x10)
    const mult = (player.id === OWNER_ID) ? 10 : 1;

    // 🔥 حساب البفات (Buffs) 🔥
    let atkMultiplier = 1.0;
    if (player.effects) {
        player.effects.forEach(e => { if (e.type === 'atk_buff') atkMultiplier += e.val; });
    }
    const effectiveAtk = Math.floor(player.atk * atkMultiplier);

    // ====================================================
    // 1. مهارات الإمبـراطـور (GOD MODE) 👑
    // ====================================================
    
    // 💀 محو الوجود (قتل فوري)
    if (skill.id === 'skill_erasure') {
        skillDmg = monster.maxHp * 9999; 
        monster.hp = 0;
        log.push(`💀 **${player.name}** أشار بيده.. ومُحي الوحش من الوجود تماماً!`);
        return { success: true, name: "مَحـو الوجـود" };
    }

    // 🌌 بوابة الأبعاد (نقل)
    if (skill.id === 'skill_dimension_gate') {
        log.push(`🌌 **${player.name}** يمزق نسيج الزمكان لفتح بوابة!`);
        return { success: true, type: 'dimension_gate_request', name: "بوابة الأبعاد" };
    }

    // 👑 نفس الإمبراطور (دعم مطلق)
    if (skill.id === 'skill_emperor_breath') {
        players.forEach(p => {
            p.isDead = false;
            p.isPermDead = false;
            p.reviveCount = 0; 
            p.hp = p.maxHp;    
            p.shield = p.maxHp; 
            p.effects.push({ type: 'atk_buff', val: 1.0, turns: 10 });
        });
        log.push(`👑 **${player.name}** وهب الحياة للفريق! (إحياء + شفاء + قوة مضاعفة)`);
        return { success: true, name: "نَفَس الإمبراطور" };
    }

    // ⚔️ انشطار الروح (50% ضرر)
    if (skill.id === 'skill_soul_fissure') {
        skillDmg = Math.floor(monster.hp * 0.50);
        monster.hp -= skillDmg;
        player.totalDamage += skillDmg;
        log.push(`⚔️ **${player.name}** قصم روح الوحش لنصفين! (**${skillDmg}** ضرر)`);
        return { success: true, name: "انشطـار الـروح" };
    }

    // ✋ الرمق الأخير (1HP + مغادرة)
    if (skill.id === 'skill_last_gasp') {
        monster.hp = 1;
        log.push(`✋ **${player.name}** ترك الوحش يلفظ أنفاسه الأخيرة (1 HP) وغادر بسلام.`);
        if (threadChannel) threadChannel.send(`🚪 **${player.name}** ترفع عن القتال وغادر المعركة!`).catch(()=>{});
        return { success: true, type: 'owner_leave', name: "الرمـق الأخيـر" };
    }

    // ⛓️ هيمنة الإمبراطور (الوحش يضرب نفسه)
    if (skill.id === 'skill_emperor_domination') {
        const selfDmg = Math.floor(monster.atk * 3); 
        monster.hp -= selfDmg;
        log.push(`⛓️ **${player.name}** أجبر الوحش على ضرب نفسه بوحشية! (**${selfDmg}** ضرر)`);
        return { success: true, name: "هيمنـة الإمبـراطـور" };
    }

    // 📜 دستور الموت (ضعف x2 للوحش)
    if (skill.id === 'skill_death_constitution') {
        monster.effects.push({ type: 'weakness', val: 1.0, turns: 99 });
        log.push(`📜 **${player.name}** سن قانون الموت! الوحش يتلقى ضرراً مضاعفاً الآن.`);
        return { success: true, name: "دستـور المـوت" };
    }


    // ====================================================
    // 2. منطق مهارات الكلاسات (Class Skills Logic)
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

         let skillName = "مهارة خاصة";
         switch(classType) {
             case 'Leader': 
                players.forEach(m => { 
                    if(!m.isDead) {
                        m.effects.push({ type: 'atk_buff', val: 0.3, turns: 2 });
                        m.critRate = (m.critRate || 0) + 0.2; 
                    } 
                });
                log.push(`⚔️ **${player.name}** أطلق صرخة الحرب! (ATK & Luck UP)`);
                skillName = "صرخة الحرب";
                player.special_cooldown = 6;
                break;

             case 'Tank': 
                monster.targetFocusId = player.id;
                player.effects.push({ type: 'def_buff', val: 0.6, turns: 2 }); 
                log.push(`🛡️ **${player.name}** استفز الوحش وتصلب!`);
                skillName = "استفزاز وتصليب";
                player.special_cooldown = 6;
                break;

             case 'Priest': 
                const dead = players.filter(m => m.isDead && !m.isPermDead); 
                if (dead.length > 0) {
                    const t = dead[0]; 
                    if (t.reviveCount >= 1) {
                        t.isPermDead = true;
                        log.push(`💀 **${t.name}** تحللت جثته وزهقت روحه ولا يمكن إحياؤه!`);
                        if(threadChannel) threadChannel.send(`💀 **${t.name}** <@${t.id}> تحللت جثته وزهقت روحه!`).catch(()=>{});
                    } else {
                        t.isDead = false; 
                        t.hp = Math.floor(t.maxHp * 0.2);
                        t.reviveCount = (t.reviveCount || 0) + 1;
                        applyDamageToPlayer(player, Math.floor(player.maxHp * 0.1)); 
                        log.push(`✨ **${player.name}** أحيا **${t.name}**!`);
                        if(threadChannel) threadChannel.send(`✨ **${player.name}** قام بإحياء **${t.name}** <@${t.id}>!`).catch(()=>{});
                        player.special_cooldown = 7;
                    }
                } else {
                    players.forEach(m => { if(!m.isDead) m.hp = Math.min(m.maxHp, m.hp + Math.floor(m.maxHp * 0.4)); });
                    log.push(`✨ **${player.name}** عالج الفريق!`);
                    player.special_cooldown = 6;
                }
                skillName = "النور المقدس";
                break;

             case 'Mage': 
                monster.frozen = true;
                log.push(`❄️ **${player.name}** جمد الوحش!`);
                skillName = "سجن الجليد";
                player.special_cooldown = 6;
                break;

             case 'Summoner': 
                player.summon = { active: true, turns: 3 };
                log.push(`🐺 **${player.name}** استدعى الحارس!`);
                skillName = "استدعاء حارس الظل";
                player.special_cooldown = 6;
                break;
         }
         return { success: true, name: skillName };
    }

    // ====================================================
    // 3. التحقق من الكولداون
    // ====================================================
    const value = skill.effectValue || (skill.base_value ? skill.base_value * (player.id === OWNER_ID ? 2 : 1) : 0); 

    if (!skill.id.startsWith('skill_') || (player.id !== OWNER_ID)) {
        if ((player.skillCooldowns[skill.id] || 0) > 0 && player.id !== OWNER_ID) {
            return { error: `⏳ المهارة "${skill.name}" في وقت انتظار (${player.skillCooldowns[skill.id]} جولات)!` };
        }
    }

    const skillCooldown = skill.cooldown || (skill.id.startsWith('race_') ? 5 : 3);
    if (player.id !== OWNER_ID) player.skillCooldowns[skill.id] = skillCooldown;


    // =================================================================
    // 🔥🔥 تنفيذ المهارات بناءً على stat_type 🔥🔥
    // =================================================================
    
    // 🔥 تعديل الألف (Elf): إعادة نظام الحظ 50% 🔥
    if (skill.id === 'race_elf_skill') {
        skillDmg = Math.floor(effectiveAtk * (value / 100 + 1)) * mult;
        monster.hp -= skillDmg;
        player.totalDamage += skillDmg;

        if (Math.random() < 0.5) { // نسبة 50%
            monster.frozen = true; // شلل
            monster.effects.push({ type: 'weakness', val: 0.5, turns: 1 });
            log.push(`🏹 **${player.name}** أصاب الوحش بالشلل في مقتل! (${skillDmg} ضرر)`);
        } else {
            log.push(`🏹 **${player.name}** أطلق وابلاً من السهام! (${skillDmg} ضرر)`);
        }
        return { success: true, name: skill.name };
    }

    switch (skill.stat_type) {
        // --- 1. Dragon ---
        case 'TrueDMG_Burn': { 
            skillDmg = Math.floor(effectiveAtk * (value / 100 + 1)) * mult;
            monster.hp -= skillDmg;
            player.totalDamage += skillDmg;
            monster.effects.push({ type: 'burn', val: Math.floor(effectiveAtk * 0.2), turns: 3 });
            log.push(`🐲 **${player.name}** أطلق ${skill.name} وأحرق الوحش! (${skillDmg} ضرر حقيقي)`);
            break;
        }

        // --- 2. Human ---
        case 'Cleanse_Buff_Shield': { 
            player.effects = player.effects.filter(e => e.type === 'buff' || e.type === 'atk_buff');
            const shieldVal = Math.floor(player.maxHp * (value / 100));
            player.shield += shieldVal;
            player.effects.push({ type: 'atk_buff', val: 0.2, turns: 2 });
            log.push(`🛡️ **${player.name}** استخدم ${skill.name}! (تطهير + درع ${shieldVal} + هجوم)`);
            break;
        }

        // --- 3. Seraphim ---
        case 'Scale_MissingHP_Heal': { 
            const missingHpPercent = (player.maxHp - player.hp) / player.maxHp;
            const extraDmg = Math.floor(effectiveAtk * missingHpPercent * 2);
            skillDmg = (Math.floor(effectiveAtk * 1.2) + extraDmg) * mult;
            const healVal = Math.floor(player.maxHp * 0.15);
            monster.hp -= skillDmg;
            player.hp = Math.min(player.maxHp, player.hp + healVal);
            player.totalDamage += skillDmg;
            log.push(`✨ **${player.name}** عاقب الوحش بـ ${skill.name}! (${skillDmg} ضرر / +${healVal} HP)`);
            break;
        }

        // --- 4. Demon ---
        case 'Sacrifice_Crit': { 
            const selfDmg = Math.floor(player.maxHp * 0.10);
            skillDmg = Math.floor(effectiveAtk * (value / 100)) * mult;
            applyDamageToPlayer(player, selfDmg);
            monster.hp -= skillDmg;
            player.totalDamage += skillDmg;
            log.push(`🩸 **${player.name}** ضحى بدمه (-${selfDmg}) لتوجيه ضربة مدمرة! (**${skillDmg}** ضرر)`);
            break;
        }

        // --- 5. Stun_Vulnerable (Generic - But Elf is handled above) ---
        case 'Stun_Vulnerable': { 
            skillDmg = Math.floor(effectiveAtk * (value / 100 + 1)) * mult;
            monster.hp -= skillDmg;
            monster.frozen = true; 
            monster.effects.push({ type: 'weakness', val: 0.5, turns: 1 }); 
            player.totalDamage += skillDmg;
            log.push(`🏹 **${player.name}** شل حركة الوحش وجعل دفاعه هشاً! (${skillDmg} ضرر)`);
            break;
        }

        // --- 6. Dark Elf ---
        case 'Confusion': { 
            skillDmg = Math.floor(effectiveAtk * (value / 100 + 1)) * mult;
            monster.hp -= skillDmg;
            monster.effects.push({ type: 'confusion', val: 0.5, turns: 2 }); 
            player.totalDamage += skillDmg;
            log.push(`🗡️ **${player.name}** أربك الوحش بـ ${skill.name}! (${skillDmg} ضرر)`);
            break;
        }

        // --- 7. Vampire ---
        case 'Lifesteal_Overheal': { 
            skillDmg = Math.floor(effectiveAtk * (value / 100 + 1)) * mult;
            monster.hp -= skillDmg;
            player.totalDamage += skillDmg;
            const healVal = Math.floor(skillDmg * 0.5);
            const missingHp = player.maxHp - player.hp;
            if (healVal > missingHp) {
                player.hp = player.maxHp;
                const overHeal = healVal - missingHp;
                player.shield += Math.floor(overHeal * 0.5);
                log.push(`🦇 **${player.name}** امتص الدماء! (شفاء تام + درع ${Math.floor(overHeal * 0.5)})`);
            } else {
                player.hp += healVal;
                log.push(`🦇 **${player.name}** امتص ${healVal} من الصحة!`);
            }
            break;
        }

        // --- 8. Hybrid ---
        case 'Chaos_RNG': { 
            skillDmg = Math.floor(effectiveAtk * (value / 100 + 1)) * mult;
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

        // --- 9. Spirit (تأكدنا هنا أنها تضرب ثم تراوغ) ---
        case 'Dmg_Evasion': { 
            skillDmg = Math.floor(effectiveAtk * (value / 100 + 1)) * mult;
            monster.hp -= skillDmg; // 1. تنفيذ الضرر
            player.totalDamage += skillDmg;
            player.effects.push({ type: 'evasion', val: 1, turns: 1 }); // 2. تفعيل المراوغة
            log.push(`👻 **${player.name}** ضرب واختفى كالشبح! (مراوغة تامة)`);
            break;
        }

        // --- 10. Dwarf ---
        case 'Reflect_Tank': { 
            const reduction = Math.min(0.8, value / 100 + 0.2); 
            player.effects.push({ type: 'dmg_reduce', val: reduction, turns: 2 });
            player.effects.push({ type: 'reflect', val: 0.5, turns: 2 }); 
            log.push(`🛡️ **${player.name}** تحصن بـ ${skill.name}! (دفاع وعكس ضرر)`);
            break;
        }

        // --- 11. Ghoul ---
        case 'Execute_Heal': { 
            skillDmg = Math.floor(effectiveAtk * (value / 100 + 1)) * mult; 
            if (monster.hp - skillDmg <= 0) {
                monster.hp = 0;
                player.hp = Math.min(player.maxHp, player.hp + Math.floor(player.maxHp * 0.25));
                log.push(`🧟 **${player.name}** افترس الوحش واستعاد 25% صحة!`);
            } else {
                monster.hp -= skillDmg;
                log.push(`🧟 **${player.name}** نهش الوحش بضرر **${skillDmg}**!`);
            }
            player.totalDamage += skillDmg;
            break;
        }
        
        // --- 12. Utility ---
        case 'Utility': {
             if (skill.id === 'skill_dispel') {
                monster.effects = []; 
                log.push(`💨 **${player.name}** بدد السحر عن الوحش!`);
             }
             break;
        }

        // --- 13. RNG (Gamble) ---
        case 'RNG': {
             if (skill.id === 'skill_gamble') {
                 const isSuccess = Math.random() < 0.5; 
                 if (isSuccess) {
                     skillDmg = Math.floor(effectiveAtk * 1.5) * mult; 
                     log.push(`🎲 **${player.name}** ربح المقامرة! ضربة مدمرة (**${skillDmg}**)!`);
                 } else {
                     skillDmg = Math.floor(effectiveAtk * 0.25) * mult;
                     const selfDmg = Math.floor(player.maxHp * 0.1);
                     applyDamageToPlayer(player, selfDmg);
                     log.push(`🎲 **${player.name}** خسر الرهان! ضربة ضعيفة وتلقى ضرراً.`);
                 }
                 monster.hp -= skillDmg;
                 player.totalDamage += skillDmg;
             }
             break;
        }

        // --- 14. Standard Skills ---
        case '%': {
            switch (skill.id) {
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
                case 'skill_rebound': { 
                     const reflectPercent = (value / 100) * mult;
                     player.effects.push({ type: 'reflect', val: reflectPercent, turns: 2 });
                     log.push(`🔄 **${player.name}** جهز الارتداد العكسي!`);
                     break;
                }
                case 'skill_weaken': {
                     skillDmg = Math.floor(effectiveAtk * 0.5) * mult;
                     monster.effects.push({ type: 'weakness', val: (value / 100), turns: 2 }); 
                     monster.hp -= skillDmg;
                     player.totalDamage += skillDmg; 
                     log.push(`📉 **${player.name}** أضعف الوحش وسبب **${skillDmg}** ضرر.`);
                     break;
                }
                default: {
                    let multiplier = 1 + (value / 100);
                    skillDmg = Math.floor(effectiveAtk * multiplier) * mult;
                    monster.hp -= skillDmg;
                    player.totalDamage += skillDmg; 
                    log.push(`💥 **${player.name}** استخدم ${skill.name} بـ **${skillDmg}** ضرر!`);
                    break;
                }
            }
            break;
        }

        default: {
             skillDmg = Math.floor(effectiveAtk) * mult;
             monster.hp -= skillDmg;
             player.totalDamage += skillDmg; 
             log.push(`⚔️ **${player.name}** هاجم بـ ${skill.name}! (${skillDmg} ضرر)`);
             break;
        }
    }
    return { success: true, name: skill.name };
}

module.exports = { handleSkillUsage };
