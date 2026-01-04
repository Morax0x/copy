const { applyDamageToPlayer } = require('../utils');
const { getSmartTarget, MONSTER_SKILLS, GENERIC_MONSTER_SKILLS } = require('../monsters');
const { checkDeaths } = require('../core/battle-utils');
const { generateBattleEmbed } = require('../ui');

// --- 🧠 دالة تحديد الأهداف التكتيكية (AI Targeting System) ---
function getTacticalTargets(players, count, monster) {
    let alive = players.filter(p => !p.isDead);
    if (alive.length === 0) return [];

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
        const aReflect = a.effects.some(e => e.type === 'reflect') ? -100 : 0;
        const bReflect = b.effects.some(e => e.type === 'reflect') ? -100 : 0;

        // 5. الاستفزاز (Taunt) - إذا لاعب مفعل تايتن يضطر الوحش يضربه
        const aTaunt = a.effects.some(e => e.type === 'titan') ? 50 : 0;
        const bTaunt = b.effects.some(e => e.type === 'titan') ? 50 : 0;

        const scoreA = aKillable + aIsPriest + aReflect + aTaunt;
        const scoreB = bKillable + bIsPriest + bReflect + bTaunt;

        return (scoreB + threatScore) - (scoreA);
    });

    return prioritized.slice(0, count);
}

async function processMonsterTurn(monster, players, log, turnCount, battleMsg, floor, theme, threadChannel) {
    // تهيئة ذاكرة الوحش
    if (!monster.memory) monster.memory = { comboStep: 0, lastMove: null, healsUsed: 0 };

    // 1. معالجة التجميد والشلل
    if (monster.frozen) { 
        log.push(`❄️ **${monster.name}** متجمد، خسر دوره!`); 
        monster.frozen = false; 
        monster.memory.comboStep = 0; 
        await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, [])] }).catch(()=>{});
        return true; 
    }

    // 2. معالجة الأضرار المستمرة (DoT)
    if (monster.effects) {
        monster.effects = monster.effects.filter(e => {
            if (e.type === 'burn') {
                const burnDmg = e.val;
                monster.hp -= burnDmg;
                log.push(`🔥 **${monster.name}** يحترق! (-${burnDmg})`);
            }
            if (e.type === 'poison') {
                const poisonDmg = e.val;
                monster.hp -= poisonDmg;
                log.push(`☠️ **${monster.name}** يتألم من السم! (-${poisonDmg})`);
            }
            e.turns--;
            return e.turns > 0;
        });
    }

    if (monster.hp <= 0) { monster.hp = 0; return false; }

    // 3. الارتباك
    const confusion = monster.effects.find(e => e.type === 'confusion');
    if (confusion && Math.random() < confusion.val) {
        const selfDmg = Math.floor(monster.atk * 0.7); // زيادة ضرر الارتباك
        monster.hp -= selfDmg;
        log.push(`😵 **${monster.name}** في حالة فوضى وضرب نفسه بقوة! (-${selfDmg})`);
        monster.memory.comboStep = 0;
        await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, [])] }).catch(()=>{});
        return true;
    }

    // --- 🎮 منطق الهجوم (AI Logic) ---
    const alive = players.filter(p => !p.isDead);
    if (alive.length === 0) return false;

    let skillUsed = false;

    // 🔥 أولوية 1: تنفيذ المهارات الخاصة (Boss Skills) من ملف monsters.js 🔥
    // البحث عن المهارة بالاسم (إزالة (Lv.X) من الاسم للمطابقة)
    const cleanName = monster.name.split(' (')[0]; 
    const specialSkill = MONSTER_SKILLS[cleanName];

    if (specialSkill) {
        // زيادة احتمالية المهارة كلما نقص دم الوحش (Enrage Phase)
        let chance = specialSkill.chance;
        if (monster.hp < monster.maxHp * 0.5) chance += 0.2; // +20% فرصة إذا دمه تحت النص

        if (Math.random() < chance) {
            specialSkill.execute(monster, players, log);
            skillUsed = true;
        }
    }

    // 🔥 أولوية 2: تنفيذ المهارات العامة (Generic Skills) للمينيون 🔥
    if (!skillUsed && !specialSkill) {
        // فرصة 30% لأي وحش عادي يستخدم مهارة عامة
        if (Math.random() < 0.30) {
            const randomGeneric = GENERIC_MONSTER_SKILLS[Math.floor(Math.random() * GENERIC_MONSTER_SKILLS.length)];
            randomGeneric.execute(monster, players, log);
            skillUsed = true;
        }
    }

    // 🔥 أولوية 3: نظام الكومبو الخاص (تكتيكات متقدمة) 🔥
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
                target.effects.push({ type: 'stun', val: 1, turns: 2 }); // شلل دورين
                log.push(`🔨 **${monster.name}** أطلق طاقته الكاملة وسحق **${target.name}**! (COMBO FINISH)`);
                skillUsed = true;
            }
        }
        monster.memory.comboStep = 0;
        monster.memory.lastMove = null;
    }

    // 🔥 أولوية 4: موراكس (الذكاء المطلق) 🔥
    if (!skillUsed && floor === 100) {
        const rand = Math.random();
        if (rand < 0.4) {
            alive.forEach(p => {
                const dmg = Math.floor(monster.atk * 1.5);
                applyDamageToPlayer(p, dmg);
                p.effects.push({ type: 'weakness', val: 0.5, turns: 99 }); // ضعف دائم
            });
            log.push(`☄️ **موراكس** أسقط نيزكاً! (ضرر جماعي + ضعف دائم)`);
            skillUsed = true;
        } 
        else if (rand < 0.6) {
            const weakTarget = alive.sort((a, b) => a.hp - b.hp)[0];
            const dmg = Math.floor(monster.atk * 3.0);
            applyDamageToPlayer(weakTarget, dmg);
            log.push(`🗡️ **موراكس** قرر إنهاء حياة **${weakTarget.name}** بضربة إعدام!`);
            skillUsed = true;
        }
    }

    // 🔥 أولوية 5: العلاج الذاتي (التعديل الجديد) 🔥
    // الشرط: الطابق 21 فما فوق، الدم أقل من 25%، ولم يستخدم العلاج أكثر من مرتين
    if (!skillUsed && floor >= 21 && monster.hp < monster.maxHp * 0.25 && monster.memory.healsUsed < 2) {
        if (Math.random() < 0.5) {
            // حساب نسبة الشفاء: تبدأ بـ 2% وتزيد 0.1% لكل طابق بعد الـ 20
            let healPercent = 0.02 + ((floor - 20) * 0.001);
            
            // سقف الشفاء 10% (تعجيزي خفيف)
            healPercent = Math.min(healPercent, 0.10); 

            const healAmount = Math.floor(monster.maxHp * healPercent);
            monster.hp += healAmount;
            monster.memory.healsUsed++;
            
            log.push(`💚 **${monster.name}** شرب جرعة دماء واستعاد عافيته! (+${healAmount})`);
            skillUsed = true;
        }
    }

    // ============================================================
    // ⚔️ 6. الهجوم الأساسي (إذا لم يستخدم أي مهارة) ⚔️
    // ============================================================
    if (!skillUsed) {
        // زيادة عدد الأهداف في الطوابق العليا
        let targetCount = 1;
        if (floor >= 30) targetCount = 2;
        if (floor >= 60) targetCount = 3;
        if (floor >= 90) targetCount = 4;

        // استخدام نظام الاستهداف الذكي جداً
        const targets = getTacticalTargets(players, targetCount, monster);

        if (targets.length > 0) {
            let hitLog = [];
            
            targets.forEach(target => {
                // زيادة الضرر كلما طالت المعركة (Enrage)
                let dmg = Math.floor(monster.atk * (1 + turnCount * 0.05));
                
                // حسابات الضعف والدفاع
                if (monster.effects.some(e => e.type === 'weakness')) dmg = Math.floor(dmg * 0.6);
                if (target.defending) dmg = Math.floor(dmg * 0.5);
                
                // الانعكاس
                const reflectEffect = target.effects.find(e => e.type === 'reflect');
                let reflectedDmg = 0;
                if (reflectEffect) {
                    reflectedDmg = Math.floor(dmg * reflectEffect.val);
                    dmg -= reflectedDmg;
                    monster.hp -= reflectedDmg;
                }

                const takenDmg = applyDamageToPlayer(target, dmg);
                
                let status = `-${takenDmg}`;
                if (takenDmg === 0 && dmg > 0) status = "🛡️ صد كامل";
                if (reflectedDmg > 0) status += ` (عكس ${reflectedDmg})`;

                hitLog.push(`${target.name}: ${status}`);
            });

            log.push(`⚔️ **${monster.name}** هاجم بوحشية: [ ${hitLog.join(' | ')} ]`);
            
            // تحقق من الوفيات فوراً
            checkDeaths(players, floor, log, threadChannel);
        }
    }

    // هجوم الحيوانات الأليفة/المستدعية
    players.forEach(p => {
        if (!p.isDead && p.summon && p.summon.active && p.summon.turns > 0) {
            const petDmg = Math.floor(p.atk * 0.4);
            monster.hp -= petDmg;
            p.totalDamage += petDmg;
            p.summon.turns--;
            if (p.summon.turns <= 0) {
                p.summon.active = false;
                log.push(`💨 اختفى مرافق **${p.name}**.`);
            }
        }
    });

    if (players.every(p => p.isDead)) return false;

    if (log.length > 6) log = log.slice(-6);
    
    // تحديث الرسالة
    try {
        await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, [])] });
    } catch (e) {
        console.log("Error updating battle message (Monster Turn):", e.message);
    }
    
    return true;
}

module.exports = { processMonsterTurn };
