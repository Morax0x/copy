// handlers/dungeon/logic/final-boss.js

const { EmbedBuilder } = require('discord.js');
// تأكد أن مسار ملف الكونفق صحيح بالنسبة لمكان هذا الملف
const dungeonConfig = require('../../../json/dungeon-config.json'); 
const { applyDamageToPlayer } = require('../utils'); 
const { generateBattleEmbed } = require('../ui');

/**
 * 1. جلب بيانات الإمبراطور موراكس
 * يتم استدعاء هذه الدالة في dungeon-battle.js عند الوصول للطابق 100
 */
function getMoraxData() {
    const bossConfig = dungeonConfig.final_boss || {};
    
    return {
        isMonster: true,
        isFinalBoss: true, // علامة مميزة للتمييز لاحقاً
        name: bossConfig.name || "الامبراطور موراكس",
        image: bossConfig.image || "https://i.postimg.cc/WzRGhgJ9/mwraks.png",
        level: 100,
        hp: 1500000,      // 1.5 مليون صحة (رقم ثابت لضمان الصعوبة)
        maxHp: 1500000,
        atk: 10000,       // هجوم فتاك
        shield: 50000,    // درع صخري ابتدائي
        enraged: false,
        effects: [],
        targetFocusId: null, // يقبل الاستفزاز
        frozen: false,
        memory: { 
            healsUsed: 0, 
            comboStep: 0, 
            turnCounter: 0 
        }
    };
}

/**
 * 2. معالجة دور موراكس (الذكاء الاصطناعي والمهارات الخاصة)
 */
async function processMoraxTurn(monster, players, log, turnCount, battleMsg, floor, theme, threadChannel) {
    monster.memory.turnCounter++;

    // ---------------------------------------------------------
    // 🛡️ معالجة الحالات السلبية (تجميد، حرق، سم)
    // حتى الزعيم الأخير يجب أن يتأثر بميكانيكيات اللعبة
    // ---------------------------------------------------------

    // 1. التجميد (يخسر دوره)
    if (monster.frozen) {
        monster.frozen = false;
        log.push(`❄️ **${monster.name}** تحرر من الجليد بفضل طاقته الهائلة! (خسر هذا الدور)`);
        // ✅ تم حذف اللون الذهبي لتسريع البوت
        await battleMsg.edit({ embeds: [generateBattleEmbed(players, monster, floor, theme, log, [])] }).catch(()=>{});
        return true;
    }

    // 2. الحرق والسم (مع سقف للضرر لمنع القتل السهل)
    if (monster.effects) {
        monster.effects = monster.effects.filter(e => {
            let dmg = 0;
            const damageCap = 25000; // سقف الضرر للحالات السلبية ضد الزعيم

            if (e.type === 'burn' || e.type === 'poison') {
                let val = e.val || 0;
                if (val < 1 && val > 0) dmg = Math.floor(monster.maxHp * val); // نسبة مئوية
                else dmg = Math.floor(val); // قيمة ثابتة
                
                // تطبيق السقف
                if (dmg > damageCap) dmg = damageCap;
                
                monster.hp = Math.max(0, monster.hp - dmg);
                const icon = e.type === 'burn' ? '🔥' : '☠️';
                log.push(`${icon} **${monster.name}** يتضرر: -${dmg}`);
            }

            e.turns--;
            return e.turns > 0;
        });
    }

    if (monster.hp <= 0) { monster.hp = 0; return false; } // مات بسبب السم/الحرق

    // ---------------------------------------------------------
    // ⚔️ ذكاء المعركة (Battle AI)
    // ---------------------------------------------------------
    
    // مهارة سلبية: تجديد الدرع كل 3 أدوار
    if (monster.memory.turnCounter % 3 === 0) {
        monster.shield += 15000;
        log.push(`🛡️ **${monster.name}** يجمع الصخور حوله ويجدد درعه! (+15,000)`);
    }

    const alive = players.filter(p => !p.isDead);
    if (alive.length === 0) return false;

    // هل تم استفزازه؟ (Taunt)
    let targets = [];
    if (monster.targetFocusId) {
        const taunted = alive.find(p => p.id === monster.targetFocusId);
        if (taunted) targets = [taunted];
        monster.targetFocusId = null; // يمسح الاستفزاز بعد الهجوم
    }

    let skillUsed = false;
    const rand = Math.random();

    // 🔥 مهارة 1: النيزك (Planet Befall) - احتمال 25%
    // ضرر جماعي هائل + تأثير ضعف
    if (!skillUsed && targets.length === 0 && rand < 0.25) {
        alive.forEach(p => {
            let dmg = Math.floor(monster.atk * 1.8);
            if (p.defending) dmg = Math.floor(dmg * 0.6); // الدفاع يقلل الضرر
            
            const taken = applyDamageToPlayer(p, dmg);
            
            // إضافة ضعف دائم (يقلل هجوم اللاعب)
            p.effects.push({ type: 'weakness', val: 0.5, turns: 99 });
        });
        log.push(`☄️ **${monster.name}**: "سأريكم النظام!" (Planet Befall) - نيزك ساحق!`);
        skillUsed = true;
    }

    // 🔥 مهارة 2: الإعدام (Execution) - احتمال 20%
    // يستهدف أضعف لاعب يحاول قتله بضربة واحدة
    else if (!skillUsed && targets.length === 0 && rand < 0.45) {
        const weakTarget = alive.sort((a, b) => a.hp - b.hp)[0];
        if (weakTarget) {
            let dmg = Math.floor(monster.atk * 4.5); // 45,000 ضرر تقريباً
            
            // تفعيل ميكانيكية الانعكاس للمدرع إذا وجدت
            const reflect = weakTarget.effects.find(e => e.type === 'reflect' || e.type === 'tank_reflect');
            if (reflect) {
                const reflected = Math.floor(dmg * (reflect.val || 0.4));
                monster.hp -= reflected;
                dmg -= reflected;
                log.push(`↩️ **${weakTarget.name}** عكس جزءاً من الإعدام! (-${reflected} للزعيم)`);
            }

            const taken = applyDamageToPlayer(weakTarget, dmg);
            log.push(`🗡️ **${monster.name}** وجه رمحه الذهبي نحو قلب **${weakTarget.name}**! (-${taken})`);
            skillUsed = true;
        }
    }

    // 🔥 مهارة 3: الزلزال (Earthquake) - احتمال 20%
    // ضرر متوسط + إلغاء البفات (Buffs)
    else if (!skillUsed && targets.length === 0 && rand < 0.65) {
        alive.forEach(p => {
            const dmg = Math.floor(monster.atk * 1.2);
            applyDamageToPlayer(p, dmg);
            // إزالة البفات الدفاعية والهجومية
            p.effects = p.effects.filter(e => !['atk_buff', 'def_buff', 'shield'].includes(e.type));
        });
        log.push(`🌋 **${monster.name}** ضرب الأرض بقوة! (زلزال) - تم تحطيم جميع الدفاعات!`);
        skillUsed = true;
    }

    // ⚔️ الهجوم العادي (Basic Attack)
    // يضرب هدفين عشوائيين إذا لم يستعمل مهارة
    if (!skillUsed) {
        const attackTargets = targets.length > 0 ? targets : alive.sort(() => 0.5 - Math.random()).slice(0, 2);
        let hitLog = [];
        
        attackTargets.forEach(t => {
            let dmg = Math.floor(monster.atk * 1.0);
            
            // تأثير البرق (Lightning Weaken) يقلل ضرر الزعيم
            const weaken = monster.effects.find(e => e.type === 'lightning_weaken');
            if (weaken) dmg = Math.floor(dmg * 0.1); // يضرب بـ 10% فقط اذا مكهرب

            const taken = applyDamageToPlayer(t, dmg);
            hitLog.push(`${t.name}: -${taken}`);
        });
        log.push(`⚔️ **${monster.name}** يهاجم: [ ${hitLog.join(' | ')} ]`);
    }

    // ---------------------------------------------------------
    // 💀 التحقق من الوفيات ومنطق الكاهن
    // ---------------------------------------------------------
    const deadJustNow = players.filter(p => p.hp <= 0 && !p.isDead);
    for (const p of deadJustNow) {
        p.isDead = true;

        // 🔥 التعديل الجديد: التحقق الفوري للموت النهائي ضد موراكس 🔥
        if (p.reviveCount && p.reviveCount >= 1) {
            p.isPermDead = true;
            await threadChannel.send(`☠️ **${p.name}** سحقه الإمبراطور تماماً... تحللت جثته ولا أمل لعودته!`).catch(()=>{});
        } else {
            await threadChannel.send(`💀 **${p.name}** لم يستطع تحمل هيبة الإمبراطور وسقط!`).catch(()=>{});
        }
        
        // إذا مات الكاهن، يعالج الفريق كحركة أخيرة
        if (p.class === 'Priest') {
             players.forEach(ally => {
                if (!ally.isDead && ally.id !== p.id) {
                    const healAmt = Math.floor(ally.maxHp * 0.30);
                    ally.hp = Math.min(ally.maxHp, ally.hp + healAmt);
                }
            });
            await threadChannel.send(`✨ **تضحية الكاهن الأخيرة!** تم شفاء الناجين بنسبة 30%.`).catch(()=>{});
        }
    }

    // تقليص السجل (Log) لكي لا يصبح طويلاً جداً
    if (log.length > 6) log.splice(0, log.length - 6);

    // ---------------------------------------------------------
    // 🎨 تحديث الإيمبد (تم إزالة اللون الذهبي)
    // ---------------------------------------------------------
    try {
        // ✅ تم حذف اللون الذهبي هنا أيضاً
        await battleMsg.edit({ 
            embeds: [generateBattleEmbed(players, monster, floor, theme, log, [])] 
        }); 
    } catch (e) { 
        console.log("Error updating Morax embed:", e.message); 
    }

    return true;
}

module.exports = { getMoraxData, processMoraxTurn };
