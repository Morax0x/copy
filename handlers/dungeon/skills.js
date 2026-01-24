// handlers/dungeon/skills.js

const { OWNER_ID } = require('./constants');
const { applyDamageToPlayer, calculateThreat } = require('./utils'); 
const { checkBossPhase } = require('./monsters');
const skillCalculator = require('../combat/skill-calculator');

// ✅ تم إضافة damageCap كمعامل أخير للتحكم في سقف الضرر
function handleSkillUsage(player, skill, monster, log, threadChannel, players, damageCap = Infinity) {
    let skillDmg = 0;

    // 🔥🔥🔥 فحص الختم (Seal Check) 🔥🔥🔥
    // نفحص هل اللاعب لديه تأثير 'seal' أو 'curse' أو أي تأثير يضعف القوة
    const isSealed = player.effects.some(e => e.type === 'seal' || e.type === 'weakness');
    // إذا كان مختوماً، القوة تصبح 20% فقط (يخسر 80%)
    const sealMultiplier = isSealed ? 0.2 : 1.0; 
    
    // ====================================================
    // 1. مهارات الإمبـراطـور (GOD MODE) 👑
    // ====================================================
    if (skill.id === 'skill_erasure') {
        monster.hp = 0;
        log.push(`💀 **${player.name}** أشار بيده.. ومُحي الوحش من الوجود تماماً!`);
        return { success: true, name: "مَحـو الوجـود" };
    }
    if (skill.id === 'skill_dimension_gate') {
        log.push(`🌌 **${player.name}** يمزق نسيج الزمكان لفتح بوابة!`);
        return { success: true, type: 'dimension_gate_request', name: "بوابة الأبعاد" };
    }
    if (skill.id === 'skill_emperor_breath') {
        players.forEach(p => {
            p.isDead = false; p.isPermDead = false; p.reviveCount = 0; 
            p.hp = p.maxHp; p.shield = p.maxHp; 
            p.effects.push({ type: 'atk_buff', val: 1.0, turns: 10 });
        });
        log.push(`👑 **${player.name}** وهب الحياة للفريق! (إحياء + شفاء + قوة مضاعفة)`);
        return { success: true, name: "نَفَس الإمبراطور" };
    }
    if (skill.id === 'skill_soul_fissure') {
        skillDmg = Math.floor(monster.hp * 0.50);
        monster.hp -= skillDmg;
        player.totalDamage += skillDmg;
        log.push(`⚔️ **${player.name}** قصم روح الوحش لنصفين! (**${skillDmg}** ضرر)`);
        checkBossPhase(monster, log); 
        return { success: true, name: "انشطـار الـروح" };
    }
    if (skill.id === 'skill_last_gasp') {
        monster.hp = 1;
        log.push(`✋ **${player.name}** ترك الوحش يلفظ أنفاسه الأخيرة (1 HP) وغادر بسلام.`);
        if (threadChannel) threadChannel.send(`🚪 **${player.name}** ترفع عن القتال وغادر المعركة!`).catch(()=>{});
        return { success: true, type: 'owner_leave', name: "الرمـق الأخيـر" };
    }
    if (skill.id === 'skill_emperor_domination') {
        const selfDmg = Math.floor(monster.atk * 3); 
        monster.hp -= selfDmg;
        log.push(`⛓️ **${player.name}** أجبر الوحش على ضرب نفسه بوحشية! (**${selfDmg}** ضرر)`);
        checkBossPhase(monster, log); 
        return { success: true, name: "هيمنـة الإمبـراطـور" };
    }
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
    } else if (skill.id === 'hybrid_heal' && player.isHybridPriest) { 
        classType = 'Priest';
    }

    if (classType) {
         if (player.special_cooldown > 0 && player.id !== OWNER_ID && skill.id !== 'hybrid_heal') {
             return { error: `⏳ المهارة في وقت انتظار (${player.special_cooldown} جولات)!` }; 
         }
         if (skill.id === 'hybrid_heal' && player.skillCooldowns['hybrid_heal'] > 0 && player.id !== OWNER_ID) {
             return { error: `⏳ مهارة الإرث في وقت انتظار (${player.skillCooldowns['hybrid_heal']} جولات)!` };
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
                player.threat = (player.threat || 0) + 300;
                break;

             case 'Tank': 
                monster.targetFocusId = player.id;
                const shieldAmount = Math.floor(player.maxHp * 0.5);
                player.shield = (player.shield || 0) + shieldAmount;
                player.effects.push({ type: 'tank_reflect', val: 0.4, turns: 2 }); 
                log.push(`🛡️ **${player.name}** استخدم الاستفزاز! (درع 50% + انعكاس 40%)`);
                skillName = "استفزاز";
                player.special_cooldown = 6;
                
                // حساب التهديد الموحد
                player.threat = (player.threat || 0) + calculateThreat(player, 0, true);
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
                        if (t.class === 'Former Leader') {
                             const currentLeader = players.find(p => p.class === 'Leader' && !p.isDead);
                             if (currentLeader) {
                                 t.class = t.originalClass || 'Adventurer';
                                 log.push(`♻️ **${t.name}** عاد للحياة واستعاد دوره كـ ${t.class}!`);
                             }
                        }
                        applyDamageToPlayer(player, Math.floor(player.maxHp * 0.1)); 
                        log.push(`✨ **${player.name}** أحيا **${t.name}**!`);
                        if(threadChannel) threadChannel.send(`✨ **${player.name}** قام بإحياء **${t.name}** <@${t.id}>!`).catch(()=>{});
                        player.threat = (player.threat || 0) + 800;
                        if (skill.id === 'hybrid_heal') player.skillCooldowns['hybrid_heal'] = 7;
                        else player.special_cooldown = 7;
                    }
                } else {
                    players.forEach(m => { if(!m.isDead) m.hp = Math.min(m.maxHp, m.hp + Math.floor(m.maxHp * 0.4)); });
                    log.push(`✨ **${player.name}** عالج الفريق!`);
                    const totalHealThreat = Math.floor((player.maxHp * 0.4) * players.filter(p=>!p.isDead).length / 2);
                    player.threat = (player.threat || 0) + totalHealThreat;
                    if (skill.id === 'hybrid_heal') player.skillCooldowns['hybrid_heal'] = 6;
                    else player.special_cooldown = 6;
                }
                skillName = "النور المقدس";
                break;

             // 🔥🔥🔥 تعديل الساحر: تطبيق سقف الضرر (Damage Cap) 🔥🔥🔥
             case 'Mage': 
                const elements = ['fire', 'ice', 'lightning'];
                const selectedElement = elements[Math.floor(Math.random() * elements.length)];
                
                const magicDmg = Math.floor(player.atk * 1.5);

                if (selectedElement === 'fire') {
                    monster.hp -= magicDmg;
                    player.totalDamage += magicDmg;
                    
                    // 1. حساب قيمة الحرق بناء على الهجوم والختم
                    let mageBurnVal = Math.floor((player.atk * 0.5) * sealMultiplier);
                    
                    // 2. ✅ تطبيق سقف الضرر (Cap) على الحرق
                    if (damageCap !== Infinity && mageBurnVal > damageCap) {
                        mageBurnVal = damageCap;
                    }

                    monster.effects.push({ type: 'burn', val: mageBurnVal, turns: 3 }); 
                    
                    log.push(`🔥 **${player.name}** (شعوذة: نار) تسبب بحرق و **${magicDmg}** ضرر!`);

                } else if (selectedElement === 'ice') {
                    monster.frozen = true;
                    log.push(`❄️ **${player.name}** (شعوذة: جليد) جمد الوحش تماماً!`);

                } else if (selectedElement === 'lightning') {
                    monster.hp -= magicDmg;
                    player.totalDamage += magicDmg;
                    monster.effects.push({ type: 'lightning_weaken', val: 0.9, turns: 1 });
                    log.push(`⚡ **${player.name}** (شعوذة: برق) صاعقة بـ **${magicDmg}** ضرر وأضعفت هجوم الوحش 90%!`);
                }

                checkBossPhase(monster, log);
                player.special_cooldown = 6;
                player.threat = (player.threat || 0) + 800;
                skillName = "شعوذة";
                break;

             case 'Summoner': 
                player.summon = { 
                    active: true, 
                    turns: 6, 
                    atkRatio: 0.7, 
                    explodeRatio: 1.2 
                };
                log.push(`🐺 **${player.name}** قام بالاستدعاء! (الوحش سيقاتل لـ 6 جولات)`);
                skillName = "استدعاء";
                player.special_cooldown = 7; 
                player.threat = (player.threat || 0) + 300;
                break;
         }
         return { success: true, name: skillName };
    }

    // ====================================================
    // 3. التحقق من الكولداون للمهارات العادية
    // ====================================================
    if (!skill.id.startsWith('skill_') || (player.id !== OWNER_ID)) {
        if ((player.skillCooldowns[skill.id] || 0) > 0 && player.id !== OWNER_ID) {
            return { error: `⏳ المهارة "${skill.name}" في وقت انتظار (${player.skillCooldowns[skill.id]} جولات)!` };
        }
    }

    const skillCooldown = skill.cooldown || (skill.id.startsWith('race_') ? 5 : 3);
    
    if (player.id !== OWNER_ID) {
        if (skill.id !== 'skill_shielding') {
            player.skillCooldowns[skill.id] = skillCooldown;
        }
    }

    // =================================================================
    // 🔥🔥 استخدام المحرك المركزي للمهارات 🔥🔥
    // =================================================================
    
    const isOwner = player.id === OWNER_ID;
    const result = skillCalculator.executeSkill(player, monster, skill, isOwner);

    // =================================================================
    // 🛡️🔥 تعديلات خاصة: الدرع + السم/الحرق (Cap + Seal + Level)
    // =================================================================

    // 1. تعديل مهارة "الدرع" العامة
    if (skill.id === 'skill_shielding') {
        const userSkillEntry = player.skills ? player.skills[skill.id] : null;
        const skillLevel = userSkillEntry ? userSkillEntry.currentLevel : 1;

        const baseShield = skillLevel * 20;
        const hpShield = Math.floor(player.maxHp * 0.10);
        
        result.shield = baseShield + hpShield; 
        result.log = `🛡️ **${player.name}** رفع درعه (${result.shield})! (مدعم بالصحة)`;
    }

    // 2. تعديل تأثيرات السم والحرق (المهارات العامة) وتطبيق السقف
    if (result.effectsApplied && result.effectsApplied.length > 0) {
        
        const userSkillEntry = player.skills ? player.skills[skill.id] : null;
        const skillLevel = userSkillEntry ? userSkillEntry.currentLevel : 1;

        result.effectsApplied.forEach(eff => {
            if (eff.type === 'poison' || eff.type === 'burn') {
                const baseVal = 50 + (skillLevel * 15);
                
                // حساب القيمة بعد الختم
                let finalVal = Math.floor(baseVal * sealMultiplier);

                // ✅ تطبيق سقف الضرر (Damage Cap)
                if (damageCap !== Infinity && finalVal > damageCap) {
                    finalVal = damageCap;
                }

                eff.val = finalVal;
            }
        });
    }

    // =================================================================

    if (result.damage > 0) {
        monster.hp -= result.damage;
        player.totalDamage += result.damage;
        
        let threatGen = calculateThreat(player, result.damage, false);
        player.threat = (player.threat || 0) + threatGen;
        
        checkBossPhase(monster, log);
    }

    if (result.heal > 0) player.hp = Math.min(player.maxHp, player.hp + result.heal);
    if (result.selfDamage > 0) applyDamageToPlayer(player, result.selfDamage);
    
    if (result.shield > 0) {
        player.shield = (player.shield || 0) + result.shield; 
    }

    if (result.effectsApplied && result.effectsApplied.length > 0) {
        result.effectsApplied.forEach(eff => {
            if (eff.type === 'stun') {
                monster.frozen = true; 
                log.push(`❄️ **${player.name}** جمد الوحش!`);
            } else if (eff.type === 'dispel') {
                monster.effects = [];
            } else {
                monster.effects.push(eff);
            }
        });
    }

    if (result.selfEffects && result.selfEffects.length > 0) {
        result.selfEffects.forEach(eff => {
            if (eff.type === 'cleanse') {
                player.effects = player.effects.filter(e => e.type === 'atk_buff' || e.type === 'def_buff' || e.type === 'titan' || e.type === 'tank_reflect');
            } else if (eff.type === 'buff') {
                player.effects.push({ type: 'atk_buff', val: eff.val, turns: eff.turns });
            } else {
                player.effects.push(eff);
            }
        });
    }

    if (result.log) {
        log.push(result.log);
    }

    return { success: true, name: skill.name };
}

module.exports = { handleSkillUsage };
