// handlers/dungeon/logic/floor-events.js

const { EmbedBuilder, Colors } = require('discord.js');
const { triggerMimicChest } = require('../mimic-chest');
const { triggerMysteryMerchant } = require('../mystery-merchant');

/**
 * تطبيق تعزيزات خاصة بطوابق معينة (مثل الطابق 51)
 * وأيضاً تأثيرات البيئة للثيمات الجديدة
 */
async function applyFloorBuffs(floor, players, threadChannel) {
    
    // --- 1. تعزيز منتصف الطريق (الطابق 51) ---
    if (floor === 51) {
        let buffApplied = false;
        players.forEach(p => {
            if (!p.isDead) {
                p.maxHp = Math.floor(p.maxHp * 2.0); // زيادة 100% (ضرب في 2)
                p.hp = p.maxHp; 
                p.effects.push({ type: 'atk_buff', val: 0.70, floors: 100 }); // زيادة 70%
                buffApplied = true;
            }
        });
        
        if (buffApplied) {
            const buffEmbed = new EmbedBuilder()
                .setTitle('⚡ فـرسـان الدانـجون!')
                .setDescription(`**حـصـلتـم علـى اعتـراف الامبراطـور بسبب وصولكم لمنتصف الدانجـون:**\n\n🩸 **نقاط الصحة +100%** \n⚔️ **ضرر +70%** `)
                .setColor(Colors.Gold);
            await threadChannel.send({ embeds: [buffEmbed] }).catch(()=>{});
        }
    }

    // --- 2. تأثيرات البيئة للثيمات الجديدة (Debuffs) ---
    
    // 🌊 ثيم أطلانتس (طوابق 71-80 افتراضياً للماء)
    // التأثير: "ضغط الماء" - يقلل الدفاع بنسبة 15%
    if (floor >= 71 && floor <= 80) {
        let debuffApplied = false;
        players.forEach(p => {
            if (!p.isDead && !p.effects.some(e => e.type === 'water_pressure')) {
                p.effects.push({ type: 'water_pressure', val: 0.15, turns: 1 }); // تأثير مستمر لكل طابق
                // ملاحظة: هذا التأثير رمزي حالياً، يمكن تفعيله في حساب الضرر لاحقاً
                debuffApplied = true;
            }
        });
        if (debuffApplied && floor === 71) { // رسالة تظهر مرة واحدة عند دخول المنطقة
            await threadChannel.send(`🌊 **ضغط الأعماق يسحق أجسادكم!** (الدفاع انخفض بنسبة 15%)`).catch(()=>{});
        }
    }

    // ⚙️ ثيم الأطلال المنسية (طوابق 81-90 افتراضياً للآلات)
    // التأثير: "الضباب الدخاني" - يقلل الدقة/الكريت بنسبة 10%
    if (floor >= 81 && floor <= 90) {
        let debuffApplied = false;
        players.forEach(p => {
            if (!p.isDead) {
                // تقليل الكريت ريت
                if (!p.originalCrit) p.originalCrit = p.critRate || 0.1; // حفظ القيمة الأصلية
                p.critRate = Math.max(0, (p.critRate || 0.1) - 0.10);
                debuffApplied = true;
            }
        });
        if (debuffApplied && floor === 81) {
            await threadChannel.send(`⚙️ **دخان المصانع يعيق الرؤية!** (انخفضت دقة الضربات الحرجة)`).catch(()=>{});
        }
    }
}

/**
 * معالجة منطق الفخاخ (Trap System)
 * يعود بـ كائن يحتوي على النتيجة (هل تم تفعيل الفخ؟ وما هو الطابق الجديد؟)
 */
async function handleTrapEvent(floor, players, threadChannel, isTrapActive) {
    // 🔥 التعديل هنا:
    // 1. النسبة أصبحت 0.001 (أي 0.1%)
    // 2. الشرط !isTrapActive يضمن عدم تكرار الفخ إذا حدث سابقاً في الرحلة
    if (floor > 10 && floor < 90 && !isTrapActive && Math.random() < 0.001) { 
        const trapStartFloor = floor;
        const minTarget = floor + 2;
        const maxTarget = 90; 
        const targetFloor = Math.floor(Math.random() * (maxTarget - minTarget + 1)) + minTarget;
        
        const trapEmbed = new EmbedBuilder()
            .setTitle('⚠️ انـذار: شـذوذ زمـكـانـي!')
            .setDescription(`🌀 **لقد وقعتم في فخ الأبعاد!**\nتم قذفكم قسراً للأمام إلى الطابق **${targetFloor}**!\n\n☠️ الوحوش هنا لا ترحم...!`)
            .setColor(Colors.DarkRed)
            .setThumbnail('https://media.discordapp.net/attachments/1145327691772481577/115000000000000000/blackhole.gif'); 
        
        await threadChannel.send({ content: `**🌀 شذوذ زمكاني!**`, embeds: [trapEmbed] }).catch(()=>{});

        // نعيد triggered: true ليقوم النظام الرئيسي بحفظ isTrapActive = true
        return { triggered: true, newFloor: targetFloor, trapStartFloor: trapStartFloor };
    }
    
    return { triggered: false };
}

/**
 * معالجة الأحداث العشوائية (تاجر / صندوق)
 */
async function handleRandomEvents(floor, lastEventFloor, lastEventType, threadChannel, players, sql, guildId, merchantState, isTrapActive) {
    const canTriggerEvent = (floor - lastEventFloor) > 4;
    
    if (canTriggerEvent && floor > 5 && !isTrapActive && Math.random() < 0.30) {
        let eventToTrigger = '';
        if (lastEventType === 'merchant') eventToTrigger = 'chest'; 
        else if (lastEventType === 'chest') eventToTrigger = 'merchant'; 
        else eventToTrigger = Math.random() < 0.5 ? 'merchant' : 'chest';

        if (eventToTrigger === 'merchant') {
            await triggerMysteryMerchant(threadChannel, players, sql, guildId, merchantState);
            return { type: 'merchant', floor: floor };
        } else {
            await triggerMimicChest(threadChannel, players);
            return { type: 'chest', floor: floor };
        }
    }
    
    return { type: lastEventType, floor: lastEventFloor }; // لا تغيير
}

module.exports = { applyFloorBuffs, handleTrapEvent, handleRandomEvents };
