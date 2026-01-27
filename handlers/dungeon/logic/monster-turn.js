// handlers/dungeon/logic/monster-turn.js

const { getFloorCaps } = require('../seal-system');
const { applyDamageToPlayer } = require('../core/battle-utils'); // تأكد من المسار الصحيح
const { MONSTER_SKILLS, GENERIC_MONSTER_SKILLS } = require('../monsters');
const { generateBattleEmbed, generateBattleRows } = require('../ui');

// --- 🧠 دالة تحديد الأهداف التكتيكية (AI Targeting System) ---
function getTacticalTargets(players, count, monster) {
    let alive = players.filter(p => !p.isDead);
    if (alive.length === 0) return [];

    // 🔥 تعديل الاستفزاز الإجباري
    if (monster.targetFocusId) {
        const tauntedTarget = alive.find(p => p.id === monster.targetFocusId);
        if (tauntedTarget) {
            return [tauntedTarget]; 
        }
    }

    let prioritized = alive.sort((a, b) => {
        const aKillable = a.hp <= monster.atk * 1.5 ? 20 : 0;
        const bKillable = b.hp <= monster.atk * 1.5 ? 20 : 0;
        
        const aIsPriest = a.class === 'Priest' ? 10 : 0;
        const bIsPriest = b.class === 'Priest' ? 10 : 0;

        const aThreat = a.atk * (a.effects.some(e => e.type === 'atk_buff') ? 1.5 : 1);
        const bThreat = b.atk * (b.effects.some(e => e.type === 'atk_buff') ? 1.5 : 1);
        const threatScore = (bThreat - aThreat) / 1000; 

        const aReflect = a.effects.some(e => e.type === 'reflect' || e.type === 'tank_reflect') ? -100 : 0;
        const bReflect = b.effects.some(e => e.type === 'reflect' || e.type === 'tank_reflect') ? -100 : 0;

        const aTaunt = a.effects.some(e => e.type === 'titan') ? 50 : 0;
        const bTaunt = b.effects.some(e => e.type === 'titan') ? 50 : 0;

        const scoreA = aKillable + aIsPriest + aReflect + aTaunt;
        const scoreB = bKillable + bIsPriest + bReflect + bTaunt;

        return (scoreB + threatScore) - (scoreA);
    });

    return prioritized.slice(0, count);
}

// دالة مساعدة لسقف الضرر (Local Helper)
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

    // 🔥 1. جلب سقف الضرر 🔥
    const { damageCap } = getFloorCaps(floor);

    // 🔥 2. حفظ حالة البرق 🔥
    const activeLightning = monster.effects.find(e => e.type === 'lightning_weaken');
    const lightningVal = activeLightning ? activeLightning.val : 0;

    // 1. التجميد
    if (monster.frozen) { 
        log.push(`❄️ **${monster.name}** متجمد، خسر دوره!`); 
        monster.frozen = false; 
        monster.memory.comboStep = 0; 
        try {
            await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, [])], components: generateBattleRows() });
        } catch(e){}
        return true; 
    }

    // 2. معالجة الأضرار المستمرة (DoT)
    if (monster.effects) {
        monster.effects = monster.effects.filter(e => {
            if (e.type === 'burn') {
                let val = e.val || 0;
                let burnDmg = (val < 1 && val > 0) ? Math.floor(monster.maxHp * val) : Math.floor(val);
                burnDmg = applyLocalCap(burnDmg, damageCap);
                monster.hp = Math.max(0, monster.hp - burnDmg);
                
                let msg = `🔥 **${monster.name}** يحترق! (-${burnDmg})`;
                if (burnDmg === damageCap) msg += " (مختوم)";
                log.push(msg);
            }

            if (e.type === 'poison') {
                let val = e.val || 0;
                let poisonDmg = (val < 1 && val > 0) ? Math.floor(monster.maxHp * val) : Math.floor(val);
                poisonDmg = applyLocalCap(poisonDmg, damageCap);
                monster.hp = Math.max(0, monster.hp - poisonDmg);
                
                let msg = `☠️ **${monster.name}** يتألم من السم! (-${poisonDmg})`;
                if (poisonDmg === damageCap) msg += " (مختوم)";
                log.push(msg);
            }

            e.turns--;
            return e.turns > 0;
        });
    }

    if (monster.hp <= 0) { monster.hp = 0; return false; }

    // ============================================================
    // 🐺 هجوم المستدعي (Summoner Pets) - تم الإصلاح ✅
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
                p.summon.active = false; // تعطيل الاستدعاء
                
                const explodeRatio = p.summon.explodeRatio || 1.2;
                let explosionDmg = Math.floor(p.atk * explodeRatio) || 1;
                explosionDmg = applyLocalCap(explosionDmg, damageCap);

                monster.hp = Math.max(0, Math.floor(monster.hp - explosionDmg));
                p.totalDamage += explosionDmg;

                log.push(`💥 **${p.summon.name}** انفجر عند الموت مسبباً **${explosionDmg}** ضرر!`);
                p.summon = null; // إزالة الاستدعاء
            }
        }
    });

    if (monster.hp <= 0) { monster.hp = 0; return false; }

    // 3. الارتباك
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

    // 🔥 أولوية 3: الكومبو 🔥
    if (!skillUsed && monster.memory.comboStep === 1) {
        if (monster.memory.lastMove === 'oil') {
            alive.forEach(p => {
                const dmg = Math.floor(monster.atk * 2.0); 
                applyDamageToPlayer(p, dmg);
                p.effects.push({ type: 'burn', val: Math.floor(monster.atk * 0.4), turns: 3 });
            });
            log.push(`🔥 **${monster.name}** فجر الزيت! (COMBO FINISH)`);
            skillUsed = true;
        } 
        else if (monster.memory.lastMove === 'charge') {
            const target = getTacticalTargets(players, 1, monster)[0];
            if (target) {
                const dmg = Math.floor(monster.atk * 3.5); 
                applyDamageToPlayer(target, dmg);
                target.effects.push({ type: 'stun', val: 1, turns: 2 }); 
                log.push(`🔨 **${monster.name}** سحق **${target.name}**! (COMBO FINISH)`);
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

            log.push(`⚔️ **${monster.name}** هاجم: [ ${hitLog.join(' | ')} ]`);
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
