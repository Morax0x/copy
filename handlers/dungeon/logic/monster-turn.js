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
        // 1. هل يمكن قتله بضربة واحدة؟ (Kill Confirm)
        const aKillable = a.hp <= monster.atk * 1.2 ? 10 : 0;
        const bKillable = b.hp <= monster.atk * 1.2 ? 10 : 0;
        
        // 2. هل هو المعالج؟ (Focus Priest)
        const aIsPriest = a.class === 'Priest' ? 5 : 0;
        const bIsPriest = b.class === 'Priest' ? 5 : 0;

        // 3. من لديه أعلى هجوم؟ (High DPS Threat)
        const aThreat = a.atk * (a.effects.some(e => e.type === 'atk_buff') ? 1.5 : 1);
        const bThreat = b.atk * (b.effects.some(e => e.type === 'atk_buff') ? 1.5 : 1);
        const threatScore = (bThreat - aThreat) / 1000; // تطبيع الرقم

        // 4. تجنب الانعكاس (Avoid Reflect)
        const aReflect = a.effects.some(e => e.type === 'reflect') ? -50 : 0;
        const bReflect = b.effects.some(e => e.type === 'reflect') ? -50 : 0;

        const scoreA = aKillable + aIsPriest + aReflect;
        const scoreB = bKillable + bIsPriest + bReflect;

        return (scoreB + threatScore) - (scoreA);
    });

    return prioritized.slice(0, count);
}

async function processMonsterTurn(monster, players, log, turnCount, battleMsg, floor, theme, threadChannel) {
    // تهيئة ذاكرة الوحش إذا لم تكن موجودة
    if (!monster.memory) monster.memory = { comboStep: 0, lastMove: null, healsUsed: 0 };

    // 1. معالجة التأثيرات المستمرة (DoT & CC)
    if (monster.frozen) { 
        log.push(`❄️ **${monster.name}** متجمد، خسر دوره!`); 
        monster.frozen = false; 
        monster.memory.comboStep = 0; // كسر الكومبو بسبب التجميد
        await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, [])] }).catch(()=>{});
        return true; 
    }

    // معالجة السم والحرق
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

    const confusion = monster.effects.find(e => e.type === 'confusion');
    if (confusion && Math.random() < confusion.val) {
        const selfDmg = Math.floor(monster.atk * 0.5);
        monster.hp -= selfDmg;
        log.push(`😵 **${monster.name}** ضرب نفسه بسبب الارتباك! (-${selfDmg})`);
        monster.memory.comboStep = 0; // كسر الكومبو
        await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, [])] }).catch(()=>{});
        return true;
    }

    // --- 🎮 بداية دور الوحش (AI Logic) ---
    const alive = players.filter(p => !p.isDead);
    if (alive.length === 0) return false;

    let skillUsed = false;

    // ============================================================
    // 🔥 1. نظام الكومبو (The Combo System) - أولوية قصوى 🔥
    // ============================================================
    if (monster.memory.comboStep === 1) {
        // تنفيذ الجزء الثاني من الكومبو
        if (monster.memory.lastMove === 'oil') {
            // كومبو الزيت + النار
            alive.forEach(p => {
                const dmg = Math.floor(monster.atk * 1.8); // ضرر عالي جداً
                applyDamageToPlayer(p, dmg);
                p.effects.push({ type: 'burn', val: Math.floor(monster.atk * 0.3), turns: 3 });
            });
            log.push(`🔥 **${monster.name}** أشعل الزيت! انفجار ناري هائل! (COMBO FINISH)`);
            skillUsed = true;
        } 
        else if (monster.memory.lastMove === 'charge') {
            // كومبو الشحن + سحق
            const target = getTacticalTargets(players, 1, monster)[0];
            if (target) {
                const dmg = Math.floor(monster.atk * 3.0); // 300% ضرر
                applyDamageToPlayer(target, dmg);
                target.effects.push({ type: 'stun', val: 1, turns: 1 });
                log.push(`🔨 **${monster.name}** أطلق طاقته المشحونة وسحق **${target.name}**! (COMBO FINISH)`);
                skillUsed = true;
            }
        }
        // تصفير الكومبو
        monster.memory.comboStep = 0;
        monster.memory.lastMove = null;
    }

    // ============================================================
    // 🚑 2. الذكاء الدفاعي (Self-Preservation) - لكل الوحوش 🚑
    // ============================================================
    if (!skillUsed && floor >= 40 && monster.hp < monster.maxHp * 0.30) {
        // فرصة العلاج تقل كلما استخدمها أكثر
        const healChance = 0.8 - (monster.memory.healsUsed * 0.2); 
        
        if (Math.random() < healChance) {
            const healAmount = Math.floor(monster.maxHp * 0.25);
            monster.hp += healAmount;
            monster.memory.healsUsed++;
            
            // إضافة تأثير دفاعي
            monster.effects = monster.effects || [];
            monster.effects.push({ type: 'shield', val: Math.floor(monster.maxHp * 0.1), turns: 1 });
            
            log.push(`💚 **${monster.name}** شعر بالخطر وعالج جراحه! (+${healAmount} HP)`);
            skillUsed = true;
        }
    }

    // ============================================================
    // 💨 3. إلغاء البفات (Counter-Play) - للطوابق العالية 💨
    // ============================================================
    if (!skillUsed && floor >= 60) {
        // البحث عن شخص مفعل Titan أو عنده بفات هجومية قوية
        const threatPlayer = alive.find(p => p.effects.some(e => e.type === 'titan' || (e.type === 'atk_buff' && e.val > 0.5)));
        
        if (threatPlayer && Math.random() < 0.6) {
            threatPlayer.effects = []; // Dispel All
            const dmg = Math.floor(monster.atk * 1.0);
            applyDamageToPlayer(threatPlayer, dmg);
            log.push(`💨 **${monster.name}** لاحظ قوة **${threatPlayer.name}** وبدد سحره تماماً!`);
            skillUsed = true;
        }
    }

    // ============================================================
    // 👑 4. ذكاء موراكس الخاص (الطابق 100) 👑
    // ============================================================
    if (!skillUsed && floor === 100 && monster.name.includes("موراكس")) {
        const rand = Math.random();
        
        if (rand < 0.3) {
            // نسخ مهارة لاعبين: كرة نارية جماعية
            alive.forEach(p => {
                const dmg = Math.floor(monster.atk * 1.3);
                applyDamageToPlayer(p, dmg);
                p.effects.push({ type: 'burn', val: Math.floor(monster.atk * 0.15), turns: 3 });
            });
            log.push(`☄️ **موراكس** استخدم [Meteor Shower]!`);
            skillUsed = true;
        } 
        else if (rand < 0.5) {
            // نسخ مهارة لاعبين: إعدام الأضعف
            const weakTarget = alive.sort((a, b) => a.hp - b.hp)[0];
            const dmg = Math.floor(monster.atk * 2.5);
            applyDamageToPlayer(weakTarget, dmg);
            log.push(`🗡️ **موراكس** نفذ [Execution] على **${weakTarget.name}**!`);
            skillUsed = true;
        }
        else if (rand < 0.7) {
            // مهارة خاصة: تفعيل الكومبو
            monster.memory.comboStep = 1;
            monster.memory.lastMove = 'charge';
            log.push(`⚠️ **موراكس** بدأ بجمع طاقة هائلة... (احذروا من الدور القادم!)`);
            skillUsed = true;
        }
    }

    // ============================================================
    // 🎲 5. بدء الكومبو (Setup Combo) - للطوابق 70+ 🎲
    // ============================================================
    if (!skillUsed && floor >= 70 && Math.random() < 0.25) {
        monster.memory.comboStep = 1;
        monster.memory.lastMove = 'oil';
        
        // تأثير أولي بسيط (رمي الزيت)
        alive.forEach(p => p.effects.push({ type: 'weakness', val: 0.2, turns: 2 }));
        log.push(`🛢️ **${monster.name}** غطى ساحة المعركة بسائل سريع الاشتعال! (استعدوا للحرق)`);
        skillUsed = true;
    }

    // ============================================================
    // ⚔️ 6. الهجوم المتعدد الذكي (Base Attack Scaling) ⚔️
    // ============================================================
    if (!skillUsed) {
        // تحديد عدد الأهداف حسب الطابق
        let targetCount = 1;
        if (floor >= 40 && floor <= 50) targetCount = 2;
        else if (floor >= 51 && floor <= 80) targetCount = 3;
        else if (floor >= 81 && floor <= 99) targetCount = 4;
        else if (floor === 100) targetCount = 5;

        // استخدام نظام الاستهداف التكتيكي
        const targets = getTacticalTargets(players, targetCount, monster);

        if (targets.length > 0) {
            let hitLog = [];
            
            targets.forEach(target => {
                // زيادة الضرر مع طول المعركة (Enrage Timer)
                let dmg = Math.floor(monster.atk * (1 + turnCount * 0.04));
                
                // تعديلات الضعف
                if (monster.effects.some(e => e.type === 'weakness')) dmg = Math.floor(dmg * 0.75);
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
                
                let status = "";
                if (takenDmg === 0 && dmg > 0) status = "🛡️ صد";
                else status = `-${takenDmg}`;
                
                if (reflectedDmg > 0) status += ` (عكس ${reflectedDmg})`;

                hitLog.push(`${target.name}: ${status}`);
            });

            log.push(`👹 **${monster.name}** هاجم: [ ${hitLog.join(' | ')} ]`);
            checkDeaths(players, floor, log, threadChannel);
        }
    }

    // 4. هجوم المستدعيات (Summons) - يحدث في النهاية كضرر إضافي
    players.forEach(p => {
        if (!p.isDead && p.summon && p.summon.active && p.summon.turns > 0) {
            const petDmg = Math.floor(p.atk * 0.5);
            monster.hp -= petDmg;
            p.totalDamage += petDmg;
            p.summon.turns--;
            if (p.summon.turns <= 0) {
                p.summon.active = false;
                log.push(`💨 انتهى استدعاء حارس **${p.name}**.`);
            }
        }
    });

    if (players.every(p => p.isDead)) return false;

    // تحديث الواجهة
    if (log.length > 6) log = log.slice(-6);
    await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, [])] }).catch(()=>{});
    
    return true;
}

module.exports = { processMonsterTurn };
