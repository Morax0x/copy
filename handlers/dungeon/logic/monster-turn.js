// handlers/dungeon/logic/monster-turn.js

// ✅ المسار الصحيح لنظام الختم
const { getFloorCaps } = require('./seal-system'); 

// ✅ المسار الصحيح لأدوات المعركة
const { applyDamageToPlayer } = require('../utils'); 

const { MONSTER_SKILLS, GENERIC_MONSTER_SKILLS } = require('../monsters');
const { generateBattleEmbed, generateBattleRows } = require('../ui');

// --- 🧠 دالة تحديد الأهداف التكتيكية (AI Targeting System) ---
function getTacticalTargets(players, count, monster) {
    let alive = players.filter(p => !p.isDead);
    if (alive.length === 0) return [];

    // 🔥 تعديل الاستفزاز الإجباري (Tank Taunt)
    // الدبابة يجبر الوحش يضربه حتى لو كان مختفي (منطقياً هو كشف نفسه للاستفزاز)
    if (monster.targetFocusId) {
        const tauntedTarget = alive.find(p => p.id === monster.targetFocusId);
        if (tauntedTarget) {
            return [tauntedTarget]; 
        }
    }

    let prioritized = alive.sort((a, b) => {
        // حساب النقاط لتحديد الأولوية
        const aKillable = a.hp <= monster.atk * 1.5 ? 20 : 0;
        const bKillable = b.hp <= monster.atk * 1.5 ? 20 : 0;
        
        const aIsPriest = a.class === 'Priest' ? 10 : 0;
        const bIsPriest = b.class === 'Priest' ? 10 : 0;

        const aThreat = a.atk * (a.effects.some(e => e.type === 'atk_buff') ? 1.5 : 1);
        const bThreat = b.atk * (b.effects.some(e => e.type === 'atk_buff') ? 1.5 : 1);
        const threatScore = (bThreat - aThreat) / 1000; 

        const aReflect = a.effects.some(e => e.type === 'reflect' || e.type === 'tank_reflect') ? -100 : 0;
        const bReflect = b.effects.some(e => e.type === 'reflect' || e.type === 'tank_reflect') ? -100 : 0;

        // 🔥 تحسين الاختفاء: نعطيه أولوية منخفضة جداً جداً
        const aInvisible = a.effects.some(e => e.type === 'evasion' || e.type === 'invisibility') ? -5000 : 0;
        const bInvisible = b.effects.some(e => e.type === 'evasion' || e.type === 'invisibility') ? -5000 : 0;

        const aTaunt = a.effects.some(e => e.type === 'titan') ? 50 : 0;
        const bTaunt = b.effects.some(e => e.type === 'titan') ? 50 : 0;

        const scoreA = aKillable + aIsPriest + aReflect + aTaunt + aInvisible;
        const scoreB = bKillable + bIsPriest + bReflect + bTaunt + bInvisible;

        return (scoreB + threatScore) - (scoreA);
    });

    return prioritized.slice(0, count);
}

// دالة مساعدة لسقف الضرر
function applyLocalCap(value, cap) {
    if (cap !== Infinity && value > cap) return cap;
    return value;
}

async function processMonsterTurn(monster, players, log, turnCount, battleMsg, floor, theme, threadChannel) {
    // 🛡️ حماية من القيم غير الصالحة
    if (isNaN(monster.hp) || monster.hp === null) monster.hp = monster.maxHp || 1000;
    if (isNaN(monster.shield) || monster.shield === null) monster.shield = 0;
    if (isNaN(monster.atk)) monster.atk = 50;

    monster.hp = Math.floor(monster.hp);
    monster.shield = Math.floor(monster.shield);
    monster.atk = Math.floor(monster.atk);

    if (!monster.memory) monster.memory = { comboStep: 0, lastMove: null, healsUsed: 0 };

    // 🔥 1. جلب سقف الضرر للطابق الحالي 🔥
    const { damageCap } = getFloorCaps(floor);

    // 🔥 2. حفظ حالة البرق (تقليل ضرر الوحش) 🔥
    const activeLightning = monster.effects.find(e => e.type === 'lightning_weaken');
    const lightningVal = activeLightning ? activeLightning.val : 0;

    // 1. التجميد (Stun/Freeze)
    if (monster.frozen) { 
        log.push(`❄️ **${monster.name}** متجمد، خسر دوره!`); 
        monster.frozen = false; 
        monster.memory.comboStep = 0; 
        try {
            await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, [])], components: generateBattleRows() });
        } catch(e){}
        return true; 
    }

    // ============================================================
    // 2. معالجة الأضرار المستمرة (DoT: Poison & Burn) - المعدلة ✅
    // ============================================================
    if (monster.effects) {
        monster.effects = monster.effects.filter(e => {
            let dmgVal = 0;
            let effectName = "";
            let icon = "";

            if (e.type === 'burn' || e.type === 'poison') {
                let rawVal = e.val || 0;

                // 🔥 التصحيح: الاعتماد على القيمة المسطحة القادمة من المهارات
                if (rawVal >= 1) {
                    // إذا كانت القيمة 1 أو أكثر، نعتبرها ضرراً ثابتاً (محسوب من المهارة)
                    dmgVal = Math.floor(rawVal);
                } else if (rawVal > 0 && rawVal < 1) {
                    // إذا كانت كسراً عشرياً، نعتبرها نسبة مئوية (للتوافق القديم)
                    dmgVal = Math.floor(monster.maxHp * rawVal);
                }

                // تطبيق سقف الضرر
                dmgVal = applyLocalCap(dmgVal, damageCap);
                
                // تطبيق الضرر
                monster.hp = Math.max(0, monster.hp - dmgVal);

                if (e.type === 'burn') { effectName = "يحترق"; icon = "🔥"; }
                if (e.type === 'poison') { effectName = "يتألم من السم"; icon = "☠️"; }

                let msg = `${icon} **${monster.name}** ${effectName}! (-${dmgVal})`;
                if (dmgVal === damageCap) msg += " (مختوم)";
                log.push(msg);
            }

            // إنقاص العداد
            if (e.turns) e.turns--;
            return e.turns > 0;
        });
    }

    if (monster.hp <= 0) { monster.hp = 0; return false; }

    // ============================================================
    // 🐺 هجوم المستدعي (Summoner Pets)
    // ============================================================
    players.forEach(p => {
        if (!p.isDead && p.summon && p.summon.active) {
            
            // 1. الهجوم العادي للاستدعاء
            const atkRatio = p.summon.atkRatio || 0.7;
            let petDmg = Math.floor(p.atk * atkRatio) || 1;
            petDmg = applyLocalCap(petDmg, damageCap);

            monster.hp = Math.max(0, Math.floor(monster.hp - petDmg));
            p.totalDamage += petDmg;
            
            log.push(`🐺 **${p.summon.name}** هاجم ${monster.name} وسبب **${petDmg}** ضرر!`);

            // إنقاص العداد
            p.summon.turns--;

            // 2. الانفجار عند النهاية
            if (p.summon.turns <= 0) {
                p.summon.active = false; 
                
                const explodeRatio = p.summon.explodeRatio || 1.2;
                let explosionDmg = Math.floor(p.atk * explodeRatio) || 1;
                explosionDmg = applyLocalCap(explosionDmg, damageCap);

                monster.hp = Math.max(0, Math.floor(monster.hp - explosionDmg));
                p.totalDamage += explosionDmg;

                log.push(`💥 **${p.summon.name}** انفجر عند الموت مسبباً **${explosionDmg}** ضرر!`);
                p.summon = null; 
            }
        }
    });

    if (monster.hp <= 0) { monster.hp = 0; return false; }

    // 3. الارتباك (Confusion)
    const confusion = monster.effects.find(e => e.type === 'confusion');
    if (confusion && Math.random() < confusion.val) {
        const selfDmg = Math.floor(monster.atk * 0.5) || 1;
        monster.hp = Math.max(0, monster.hp - selfDmg);
        log.push(`😵 **${monster.name}** في حالة فوضى وضرب نفسه! (-${selfDmg})`);
        monster.memory.comboStep = 0;
        try {
            await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, [])], components: generateBattleRows() });
        } catch(e){}
        return true;
    }

    // --- 🎮 منطق الهجوم (AI Logic) ---
    const alive = players.filter(p => !p.isDead);
    if (alive.length === 0) return false;

    let skillUsed = false;

    // 🔥 أولوية 1: مهارات الزعيم 🔥
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

    // 🔥 أولوية 2: المهارات العامة 🔥
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

    // 🔥 أولوية 3: الكومبو (Combos) 🔥
    if (!skillUsed && monster.memory.comboStep === 1) {
        // كومبو الزيت (AoE)
        if (monster.memory.lastMove === 'oil') {
            alive.forEach(p => {
                // ✅ التحقق من الاختفاء هنا أيضاً لتفادي حرق المختفين
                if (p.effects.some(e => e.type === 'evasion' || e.type === 'invisibility')) return;

                const dmg = Math.floor(monster.atk * 2.0); 
                applyDamageToPlayer(p, dmg);
                p.effects.push({ type: 'burn', val: Math.floor(monster.atk * 0.4), turns: 3 });
            });
            log.push(`🔥 **${monster.name}** فجر الزيت! (COMBO FINISH)`);
            skillUsed = true;
        } 
        // كومبو الشحن (Targeted)
        else if (monster.memory.lastMove === 'charge') {
            const target = getTacticalTargets(players, 1, monster)[0];
            
            // ✅ التحقق من الاختفاء قبل الضربة القاضية
            if (target && !target.effects.some(e => e.type === 'evasion' || e.type === 'invisibility')) {
                const dmg = Math.floor(monster.atk * 3.5); 
                applyDamageToPlayer(target, dmg);
                target.effects.push({ type: 'stun', val: 1, turns: 2 }); 
                log.push(`🔨 **${monster.name}** سحق **${target.name}**! (COMBO FINISH)`);
                skillUsed = true;
            } else {
                log.push(`💨 **${monster.name}** هاجم بكل قوته لكن الهدف اختفى!`);
                skillUsed = true; // نعتبر المهارة استهلكت
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
            log.push(`💚 **${monster.name}** استعاد عافيته! (+${healAmount})`);
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

        if (monster.targetFocusId) targetCount = 1;

        const targets = getTacticalTargets(players, targetCount, monster);

        if (targets.length > 0) {
            let hitLog = [];
            
            targets.forEach(target => {
                // 🔥🔥🔥 التحقق من الاختفاء (Basic Attack) 🔥🔥🔥
                if (target.effects.some(e => e.type === 'evasion' || e.type === 'invisibility')) {
                    hitLog.push(`${target.name}: 👻 اختفاء (Miss)`);
                    return; // تخطي هذا اللاعب تماماً
                }

                let dmg = Math.floor(monster.atk * (1 + turnCount * 0.01));
                
                if (lightningVal > 0) dmg = Math.floor(dmg * (1 - lightningVal)); 
                else if (monster.effects.some(e => e.type === 'weakness')) dmg = Math.floor(dmg * 0.6);

                if (target.defending) dmg = Math.floor(dmg * 0.5);
                
                // 🛡️ الانعكاس
                const reflectEffect = target.effects.find(e => e.type === 'reflect' || e.type === 'tank_reflect');
                let reflectedDmg = 0;
                
                if (reflectEffect) {
                    reflectedDmg = Math.floor(dmg * (reflectEffect.val || 0)); 
                    dmg = Math.floor(dmg - reflectedDmg);
                    monster.hp = Math.max(0, Math.floor(monster.hp - reflectedDmg));
                }

                const takenDmg = applyDamageToPlayer(target, dmg);
                
                let status = `-${takenDmg}`;
                if (takenDmg === 0 && dmg > 0) status = "🛡️ صد كامل";
                
                if (lightningVal > 0) status += " (⚡ضعف)";
                if (reflectedDmg > 0) status += ` (عكس ${reflectedDmg})`;

                hitLog.push(`${target.name}: ${status}`);
            });

            if (hitLog.length > 0) {
                log.push(`⚔️ **${monster.name}** هاجم: [ ${hitLog.join(' | ')} ]`);
            } else {
                log.push(`⚔️ **${monster.name}** هاجم لكن لم يصب أحداً!`);
            }
        }
    }

    if (monster.targetFocusId) monster.targetFocusId = null;

    // 🛡️ فحص نهائي
    if (monster.hp < 0) monster.hp = 0;
    if (isNaN(monster.hp)) monster.hp = 0;

    // ---------------------------------------------------------
    // 💀 معالجة الوفيات
    // ---------------------------------------------------------
    const deadJustNow = players.filter(p => p.hp <= 0 && !p.isDead);
    for (const p of deadJustNow) {
        p.isDead = true; 

        if (p.reviveCount && p.reviveCount >= 1) {
            p.isPermDead = true;
            await threadChannel.send(`☠️ **${p.name}** لم يحتمل المزيد... تحللت جثته! (خروج نهائي)`).catch(()=>{});
        } 
        else {
            await threadChannel.send(`💀 **${p.name}** سقط في أرض المعركة!`).catch(()=>{});
        }

        if (p.class === 'Priest') {
             players.forEach(ally => {
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
        await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, [])], components: generateBattleRows() });
    } catch (e) {
        console.log("Error updating battle message:", e.message);
    }
    
    return true;
}

module.exports = { processMonsterTurn };
