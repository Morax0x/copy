// handlers/dungeon/logic/monster-turn.js

// ✅ استدعاء نظام سقف الضرر (Seal System)
const { getFloorCaps } = require('./seal-system');
// ✅ استدعاء دالة التهديد الموحدة (calculateThreat)
const { applyDamageToPlayer } = require('../utils');
const { MONSTER_SKILLS, GENERIC_MONSTER_SKILLS } = require('../monsters');
const { checkDeaths } = require('../core/battle-utils');
const { generateBattleEmbed } = require('../ui');

// --- 🧠 دالة تحديد الأهداف التكتيكية (AI Targeting System) ---
function getTacticalTargets(players, count, monster) {
    let alive = players.filter(p => !p.isDead);
    if (alive.length === 0) return [];

    // 🔥 تعديل الاستفزاز الإجباري (Taunt Fix)
    if (monster.targetFocusId) {
        const tauntedTarget = alive.find(p => p.id === monster.targetFocusId);
        if (tauntedTarget) {
            return [tauntedTarget]; // إرجاع الهدف المستفز فقط (100% نسبة)
        }
    }

    // ترتيب اللاعبين حسب "قيمة التهديد" (Threat Level)
    let prioritized = alive.sort((a, b) => {
        // 1. هل يمكن قتله بضربة واحدة؟ (Kill Confirm) - أولوية قصوى
        const aKillable = a.hp <= monster.atk * 1.5 ? 20 : 0;
        const bKillable = b.hp <= monster.atk * 1.5 ? 20 : 0;
        
        // 2. هل هو المعالج؟ (Focus Priest)
        const aIsPriest = a.class === 'Priest' ? 10 : 0;
        const bIsPriest = b.class === 'Priest' ? 10 : 0;

        // 3. من لديه أعلى هجوم؟ (High DPS Threat)
        const aThreat = a.atk * (a.effects.some(e => e.type === 'atk_buff') ? 1.5 : 1);
        const bThreat = b.atk * (b.effects.some(e => e.type === 'atk_buff') ? 1.5 : 1);
        const threatScore = (bThreat - aThreat) / 1000; 

        // 4. تجنب الانعكاس (Avoid Reflect) - ذكاء الوحش
        // 🔥 تم التحديث ليشمل انعكاس المدرع tank_reflect 🔥
        const aReflect = a.effects.some(e => e.type === 'reflect' || e.type === 'tank_reflect') ? -100 : 0;
        const bReflect = b.effects.some(e => e.type === 'reflect' || e.type === 'tank_reflect') ? -100 : 0;

        // 5. الاستفزاز (Taunt) - إذا لاعب مفعل تايتن أو استفزاز يضطر الوحش يضربه
        // (الاستفزاز يجبر الوحش تقنياً عبر targetFocusId، لكن هذا الوزن للدعم)
        const aTaunt = a.effects.some(e => e.type === 'titan') ? 50 : 0;
        const bTaunt = b.effects.some(e => e.type === 'titan') ? 50 : 0;

        const scoreA = aKillable + aIsPriest + aReflect + aTaunt;
        const scoreB = bKillable + bIsPriest + bReflect + bTaunt;

        return (scoreB + threatScore) - (scoreA);
    });

    return prioritized.slice(0, count);
}

async function processMonsterTurn(monster, players, log, turnCount, battleMsg, floor, theme, threadChannel) {
    // 🛡️🛡️ حماية قصوى من NaN وتصحيح القيم في بداية الدور 🛡️🛡️
    if (isNaN(monster.hp) || monster.hp === null) { 
        monster.hp = monster.maxHp || 1000; 
        console.log("⚠️ Fixed Monster NaN HP in turn start"); 
    }
    if (isNaN(monster.shield) || monster.shield === null) { monster.shield = 0; } 
    if (isNaN(monster.atk)) { monster.atk = 50; } 

    monster.hp = Math.floor(monster.hp);
    monster.shield = Math.floor(monster.shield);
    monster.atk = Math.floor(monster.atk);
    // -----------------------------------------------------

    if (!monster.memory) monster.memory = { comboStep: 0, lastMove: null, healsUsed: 0 };

    // 🔥 1. جلب سقف الضرر لهذا الطابق 🔥
    const { damageCap } = getFloorCaps(floor);

    // 1. معالجة التجميد والشلل
    if (monster.frozen) { 
        log.push(`❄️ **${monster.name}** متجمد، خسر دوره!`); 
        monster.frozen = false; 
        monster.memory.comboStep = 0; 
        // ✅ تم حذف اللون الأحمر من هنا لتسريع البوت
        await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, [])] }).catch(()=>{});
        return true; 
    }

    // =========================================================
    // 2. معالجة الأضرار المستمرة (DoT) - تم التعديل لتطبيق السقف (Cap) ✅
    // =========================================================
    if (monster.effects) {
        monster.effects = monster.effects.filter(e => {
            
            // --- معالجة الحرق 🔥 ---
            if (e.type === 'burn') {
                let val = e.val || 0;
                let burnDmg = 0;
                
                // إذا القيمة كسرية (مثلاً 0.05) احسبها كنسبة مئوية
                if (val < 1 && val > 0) {
                    burnDmg = Math.floor(monster.maxHp * val);
                } else {
                    burnDmg = Math.floor(val);
                }
                
                // 🔥 تطبيق سقف الضرر (Cap) على الحرق 🔥
                if (damageCap !== Infinity && burnDmg > damageCap) {
                    burnDmg = damageCap;
                }

                monster.hp = Math.max(0, monster.hp - burnDmg);
                
                // رسالة توضيحية إذا تم تقييد الضرر
                let msg = `🔥 **${monster.name}** يحترق! (-${burnDmg})`;
                if (damageCap !== Infinity && burnDmg === damageCap) msg += " (مختوم)";
                log.push(msg);
            }

            // --- معالجة السم ☠️ ---
            if (e.type === 'poison') {
                let val = e.val || 0;
                let poisonDmg = 0;

                // إذا القيمة كسرية (مثلاً 0.05) احسبها كنسبة مئوية
                if (val < 1 && val > 0) {
                    poisonDmg = Math.floor(monster.maxHp * val);
                } else {
                    poisonDmg = Math.floor(val);
                }

                // 🔥 تطبيق سقف الضرر (Cap) على السم 🔥
                if (damageCap !== Infinity && poisonDmg > damageCap) {
                    poisonDmg = damageCap;
                }

                monster.hp = Math.max(0, monster.hp - poisonDmg);
                
                // رسالة توضيحية إذا تم تقييد الضرر
                let msg = `☠️ **${monster.name}** يتألم من السم! (-${poisonDmg})`;
                if (damageCap !== Infinity && poisonDmg === damageCap) msg += " (مختوم)";
                log.push(msg);
            }

            // إزالة تأثير إضعاف البرق بعد انتهاء دوره (لأنه يستمر دور واحد عادة)
            if (e.type === 'lightning_weaken') {
                e.turns--;
            } else {
                e.turns--;
            }
            return e.turns > 0;
        });
    }

    if (monster.hp <= 0) { monster.hp = 0; return false; }

    // 3. الارتباك
    const confusion = monster.effects.find(e => e.type === 'confusion');
    if (confusion && Math.random() < confusion.val) {
        const selfDmg = Math.floor(monster.atk * 0.5) || 1;
        monster.hp = Math.max(0, monster.hp - selfDmg);
        log.push(`😵 **${monster.name}** في حالة فوضى وضرب نفسه! (-${selfDmg})`);
        monster.memory.comboStep = 0;
        // ✅ تم حذف اللون الأحمر من هنا لتسريع البوت
        await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, [])] }).catch(()=>{});
        return true;
    }

    // --- 🎮 منطق الهجوم (AI Logic) ---
    const alive = players.filter(p => !p.isDead);
    if (alive.length === 0) return false;

    let skillUsed = false;

    // 🔥 أولوية 1: تنفيذ المهارات الخاصة (Boss Skills) 🔥
    const cleanName = monster.name.split(' (')[0]; 
    const specialSkill = MONSTER_SKILLS[cleanName];

    if (specialSkill) {
        let chance = specialSkill.chance;
        if (monster.hp < monster.maxHp * 0.5) chance += 0.2; 

        if (Math.random() < chance) {
            specialSkill.execute(monster, players, log);
            skillUsed = true;
        }
    }

    // 🔥 أولوية 2: تنفيذ المهارات العامة 🔥
    if (!skillUsed && !specialSkill) {
        let allowSkills = false;
        if (floor < 20) allowSkills = false;
        else if (floor < 40) { if (Math.random() < 0.15) allowSkills = true; }
        else { if (Math.random() < 0.30) allowSkills = true; }

        if (allowSkills) {
            const randomGeneric = GENERIC_MONSTER_SKILLS[Math.floor(Math.random() * GENERIC_MONSTER_SKILLS.length)];
            if (randomGeneric) {
                randomGeneric.execute(monster, players, log);
                if (isNaN(monster.shield)) monster.shield = 0;
                monster.shield = Math.floor(monster.shield);
                skillUsed = true;
            }
        }
    }

    // 🔥 أولوية 3: نظام الكومبو 🔥
    if (!skillUsed && monster.memory.comboStep === 1) {
        if (monster.memory.lastMove === 'oil') {
            alive.forEach(p => {
                const dmg = Math.floor(monster.atk * 2.0); 
                applyDamageToPlayer(p, dmg);
                p.effects.push({ type: 'burn', val: Math.floor(monster.atk * 0.4), turns: 3 });
            });
            log.push(`🔥 **${monster.name}** فجر الزيت! الجميع يحترق! (COMBO FINISH)`);
            skillUsed = true;
        } 
        else if (monster.memory.lastMove === 'charge') {
            const target = getTacticalTargets(players, 1, monster)[0];
            if (target) {
                const dmg = Math.floor(monster.atk * 3.5); 
                applyDamageToPlayer(target, dmg);
                target.effects.push({ type: 'stun', val: 1, turns: 2 }); 
                log.push(`🔨 **${monster.name}** أطلق طاقته الكاملة وسحق **${target.name}**! (COMBO FINISH)`);
                skillUsed = true;
            }
        }
        monster.memory.comboStep = 0;
        monster.memory.lastMove = null;
    }

    // 🔥 أولوية 4: العلاج الذاتي 🔥
    if (!skillUsed && floor >= 25 && monster.hp < monster.maxHp * 0.25 && monster.memory.healsUsed < 2) {
        if (Math.random() < 0.5) {
            let healPercent = 0.02 + ((floor - 20) * 0.001);
            healPercent = Math.min(healPercent, 0.10); 
            const healAmount = Math.floor(monster.maxHp * healPercent) || 1;
            monster.hp = Math.floor(monster.hp + healAmount);
            monster.memory.healsUsed++;
            log.push(`💚 **${monster.name}** شرب جرعة دماء واستعاد عافيته! (+${healAmount})`);
            skillUsed = true;
        }
    }

    // ============================================================
    // ⚔️ 5. الهجوم الأساسي (Basic Attack) ⚔️
    // ============================================================
    if (!skillUsed) {
        let targetCount = 1;
        if (floor >= 30) targetCount = 2;
        if (floor >= 60) targetCount = 3;
        if (floor >= 90) targetCount = 4;

        // 🔥 إذا كان هناك استفزاز (TargetFocus)، نتجاهل عدد الأهداف ونهجم عليه هو فقط 🔥
        if (monster.targetFocusId) targetCount = 1;

        const targets = getTacticalTargets(players, targetCount, monster);

        if (targets.length > 0) {
            let hitLog = [];
            
            targets.forEach(target => {
                let dmg = Math.floor(monster.atk * (1 + turnCount * 0.01));
                
                // ⚡⚡⚡ تطبيق تأثير البرق للساحر ⚡⚡⚡
                const lightningDebuff = monster.effects.find(e => e.type === 'lightning_weaken');
                if (lightningDebuff) {
                    // إذا كان الوحش مصاباً بالبرق، يقل ضرره بنسبة القيمة (0.9) أي يضرب بـ 10% فقط
                    dmg = Math.floor(dmg * (1 - lightningDebuff.val)); 
                } 
                // تأثير الضعف العادي
                else if (monster.effects.some(e => e.type === 'weakness')) {
                    dmg = Math.floor(dmg * 0.6);
                }

                if (target.defending) dmg = Math.floor(dmg * 0.5);
                
                // 🛡️🛡️ تطبيق الانعكاس (للمدرع وللجرعات) 🛡️🛡️
                const reflectEffect = target.effects.find(e => e.type === 'reflect' || e.type === 'tank_reflect');
                let reflectedDmg = 0;
                
                if (reflectEffect) {
                    // حساب الضرر المنعكس بناءً على النسبة (40% للمدرع، 50% للجرعة)
                    reflectedDmg = Math.floor(dmg * (reflectEffect.val || 0)); 
                    
                    // تقليل الضرر القادم للاعب
                    dmg = Math.floor(dmg - reflectedDmg);
                    
                    // الوحش يتضرر من الانعكاس
                    monster.hp = Math.max(0, Math.floor(monster.hp - reflectedDmg));
                }

                const takenDmg = applyDamageToPlayer(target, dmg);
                
                let status = `-${takenDmg}`;
                if (takenDmg === 0 && dmg > 0) status = "🛡️ صد كامل";
                
                if (lightningDebuff) status += " (⚡ضعف)";
                if (reflectedDmg > 0) status += ` (عكس ${reflectedDmg})`;

                hitLog.push(`${target.name}: ${status}`);
            });

            log.push(`⚔️ **${monster.name}** هاجم: [ ${hitLog.join(' | ')} ]`);
        }
    }

    // 🔥🔥🔥 مسح الاستفزاز بعد انتهاء الدور (لأنه يسري لدور واحد/هجوم واحد) 🔥🔥🔥
    if (monster.targetFocusId) {
        monster.targetFocusId = null;
    }

    // ============================================================
    // 🐺 هجوم المستدعي (Summoner Pets) 🐺
    // ============================================================
    players.forEach(p => {
        if (!p.isDead && p.summon && p.summon.active) {
            // 1. هجوم المرافق التلقائي (70% من الهجوم)
            const atkRatio = p.summon.atkRatio || 0.7; // الافتراضي 70%
            const petDmg = Math.floor(p.atk * atkRatio) || 1;
            
            monster.hp = Math.max(0, Math.floor(monster.hp - petDmg));
            p.totalDamage += petDmg;
            
            // إنقاص عداد الجولات
            p.summon.turns--;

            // 2. انفجار المرافق عند النهاية (120% من الهجوم)
            if (p.summon.turns <= 0) {
                p.summon.active = false;
                
                const explodeRatio = p.summon.explodeRatio || 1.2; // الافتراضي 120%
                const explosionDmg = Math.floor(p.atk * explodeRatio) || 1;
                
                monster.hp = Math.max(0, Math.floor(monster.hp - explosionDmg));
                p.totalDamage += explosionDmg;

                log.push(`💥 **وحش ${p.name}** انفجر عند الموت مسبباً **${explosionDmg}** ضرر!`);
            }
        }
    });

    // 🛡️ فحص نهائي
    if (monster.hp < 0) monster.hp = 0;
    if (isNaN(monster.hp)) monster.hp = 0;

    // ---------------------------------------------------------
    // 💀 معالجة الوفيات (Death Handling) - المنطق الجديد 🔥
    // ---------------------------------------------------------
    const deadJustNow = players.filter(p => p.hp <= 0 && !p.isDead);
    for (const p of deadJustNow) {
        p.isDead = true; 

        // 🛑 التحقق: هل هذه الموتة الثانية؟ (reviveCount > 0)
        // 🛑 إذا نعم، نعتبره ميتاً نهائياً فوراً ونرسل رسالة التحلل
        if (p.reviveCount && p.reviveCount >= 1) {
            p.isPermDead = true; // تثبيت الموت النهائي
            await threadChannel.send(`☠️ **${p.name}** لم يحتمل المزيد... تحللت جثته وتلاشى للأبد! (خروج نهائي)`).catch(()=>{});
        } 
        // 🛑 إذا لا، هذه الموتة الأولى، نرسل رسالة السقوط العادية
        else {
            await threadChannel.send(`💀 **${p.name}** سقط في أرض المعركة!`).catch(()=>{});
        }

        // محاولة إنعاش الكاهن (لن تعمل إذا isPermDead = true في مهارة الإحياء)
        if (p.class === 'Priest') {
             players.forEach(ally => {
                // الكاهن يعالج الأحياء فقط
                if (!ally.isDead && ally.id !== p.id) {
                    const healAmt = Math.floor(ally.maxHp * 0.20);
                    ally.hp = Math.min(ally.maxHp, ally.hp + healAmt);
                }
            });
            await threadChannel.send(`✨ **سـقـط الكـاهن وعـالج الفريـق عـلى الرمـق الاخيـر ✨**`).catch(()=>{});
        }
    }

    if (players.every(p => p.isDead)) return false;

    if (log.length > 6) log = log.slice(-6);
    
    // تحديث الرسالة
    try {
        // ✅✅✅ تم حذف اللون الأحمر ('#FF0000') من هنا لتسريع البوت ✅✅✅
        await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, [])] });
    } catch (e) {
        console.log("Error updating battle message (Monster Turn):", e.message);
    }
    
    return true;
}

module.exports = { processMonsterTurn };
