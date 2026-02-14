// handlers/dungeon/logic/floor-events.js

const { EmbedBuilder, Colors } = require('discord.js');
const { triggerMimicChest } = require('../mimic-chest');
const { triggerMysteryMerchant } = require('../mystery-merchant');

/**
 * تطبيق تعزيزات خاصة بطوابق معينة (51 و 75)
 * يضمن بقاء البف حتى لو خرج اللاعب وعاد (Save/Load)
 */
async function applyFloorBuffs(floor, players, threadChannel) {
    
    // ====================================================
    // ⚡ 1. تعزيز الفرسان (يبدأ من الطابق 51 ويستمر)
    // ====================================================
    if (floor >= 51) {
        let buffApplied = false;
        // متغير لعرض الرسالة فقط إذا كنا في الطابق 51 بالضبط
        let showMessage = (floor === 51); 

        players.forEach(p => {
            // نتحقق: هل هو حي؟ وهل أخذ البف سابقاً؟
            if (!p.isDead && !p.isPermDead && !p.hasFloor51Buff) {
                p.maxHp = Math.floor(p.maxHp * 2.0); // زيادة 100% (x2)
                p.hp = p.maxHp; // علاج كامل
                p.effects.push({ type: 'atk_buff', val: 0.70, floors: 100 }); // ضرر +70%
                
                p.hasFloor51Buff = true; // ✅ تم استلام البف
                buffApplied = true;
            }
        });
        
        // نرسل الرسالة فقط في لحظة الوصول للطابق 51
        if (showMessage && buffApplied) {
            const buffEmbed = new EmbedBuilder()
                .setTitle('⚡ فـرسـان الدانـجون!')
                .setDescription(`**حـصـلتـم علـى اعتـراف الامبراطـور بسبب وصولكم لمنتصف الدانجـون:**\n\n🩸 **نقاط الصحة +100%** \n⚔️ **ضرر +70%** `)
                .setColor(Colors.Gold)
                // 🔥 تم التعديل: الصورة كبيرة الآن 🔥
                .setImage('https://i.postimg.cc/PJSQZfwh/75.png'); 
            await threadChannel.send({ embeds: [buffEmbed] }).catch(()=>{});
        }
    }

    // ====================================================
    // 🔥 2. تعزيز النخبة (يبدأ من الطابق 75 ويستمر) - إضافي
    // ====================================================
    if (floor >= 75) {
        let buffApplied = false;
        let showMessage = (floor === 75);

        players.forEach(p => {
            // نتحقق: هل هو حي؟ وهل أخذ بف الـ 75؟
            if (!p.isDead && !p.isPermDead && !p.hasFloor75Buff) {
                // زيادة إضافية فوق الزيادة السابقة
                p.maxHp = Math.floor(p.maxHp * 2.0); // دبل مرة أخرى (المجموع x4 عن الأصل)
                p.hp = p.maxHp; 
                p.effects.push({ type: 'atk_buff', val: 0.80, floors: 100 }); // ضرر إضافي +80%
                
                p.hasFloor75Buff = true; // ✅ تم استلام البف
                buffApplied = true;
            }
        });

        if (showMessage && buffApplied) {
            const eliteEmbed = new EmbedBuilder()
                .setTitle('🔥 أسـيـاد الدانـجـون!')
                .setDescription(`**لقد تجاوزتم حدود البشر ووصلتم للأعماق السحيقة!**\nتعـزيـز تراكـمي:\n\n🩸 **نقاط الصحة +100%** \n⚔️ **ضرر +80%** `)
                .setColor(Colors.Red)
                // 🔥 تم التعديل: الصورة كبيرة الآن 🔥
                .setImage('https://i.postimg.cc/PJSQZfwh/75.png'); 
            await threadChannel.send({ embeds: [eliteEmbed] }).catch(()=>{});
        }
    }

    // ====================================================
    // 🌍 3. تأثيرات البيئة (Debuffs)
    // ====================================================
    
    // 🌊 ثيم أطلانتس (71-80)
    if (floor >= 71 && floor <= 80) {
        let debuffApplied = false;
        players.forEach(p => {
            if (!p.isDead && !p.isPermDead && !p.effects.some(e => e.type === 'water_pressure')) {
                p.effects.push({ type: 'water_pressure', val: 0.15, turns: 1 });
                debuffApplied = true;
            }
        });
        if (debuffApplied && floor === 71) {
            await threadChannel.send(`🌊 **ضغط الأعماق يسحق أجسادكم!** (الدفاع انخفض بنسبة 15%)`).catch(()=>{});
        }
    }

    // ⚙️ ثيم الأطلال (81-90)
    if (floor >= 81 && floor <= 90) {
        let debuffApplied = false;
        players.forEach(p => {
            if (!p.isDead && !p.isPermDead) {
                if (!p.originalCrit) p.originalCrit = p.critRate || 0.1;
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
 */
async function handleTrapEvent(floor, players, threadChannel, isTrapActive) {
    // النسبة 0.1% (0.001) وشرط عدم التكرار (!isTrapActive)
    if (floor > 10 && floor < 90 && !isTrapActive && Math.random() < 0.001) { 
        const trapStartFloor = floor;
        const minTarget = floor + 2;
        const maxTarget = 90; 
        const targetFloor = Math.floor(Math.random() * (maxTarget - minTarget + 1)) + minTarget;
        
        const trapEmbed = new EmbedBuilder()
            .setTitle('⚠️ انـذار: شـذوذ زمـكـانـي!')
            .setDescription(`🌀 **لقد وقعتم في فخ الأبعاد!**\nتم قذفكم قسراً للأمام إلى الطابق **${targetFloor}**!\n\n☠️ الوحوش هنا لا ترحم...!`)
            .setColor(Colors.DarkRed)
            .setImage('https://i.postimg.cc/sxT4SfhV/bla.png'); // ✅ الصورة كبيرة أصلاً
        
        await threadChannel.send({ content: `**🌀 شذوذ زمكاني!**`, embeds: [trapEmbed] }).catch(()=>{});

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
    
    return { type: lastEventType, floor: lastEventFloor };
}

module.exports = { applyFloorBuffs, handleTrapEvent, handleRandomEvents };
