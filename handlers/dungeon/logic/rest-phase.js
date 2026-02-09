// handlers/dungeon/logic/rest-phase.js

const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    Colors,
    ComponentType,
    MessageFlags // ✅ ضروري لإصلاح التحذير
} = require('discord.js');

const { EMOJI_MORA, EMOJI_XP } = require('../constants');
const { getBaseFloorMora } = require('../utils');
const { snapshotLootAtFloor20, handleMemberRetreat } = require('../core/rewards');
const { handleLeaderSuccession } = require('../core/battle-utils');

/**
 * تطبيق تحديثات ما بعد المعركة (غنائم + علاج)
 */
async function applyPostBattleUpdates(players, floor, threadChannel, totals) {
    // 1. حساب الغنائم (باستخدام نظام الشرائح الجديد)
    let baseMora = Math.floor(getBaseFloorMora(floor));
      
    // 🔥 نسبة الـ XP هي 3% بناءً على طلبك
    let floorXp = Math.floor(baseMora * 0.03); 
      
    players.forEach(p => { 
        if (!p.isDead) { 
            p.loot.mora += baseMora; 
            p.loot.xp += floorXp; 
        } 
    });

    // تحديث الإجماليات (يتم تمرير كائن totals لتحديثه بالمرجع)
    totals.coins += baseMora;
    totals.xp += floorXp;

    // 2. نقطة الأمان
    if (floor === 20 || floor === 50) {
        snapshotLootAtFloor20(players);
        await threadChannel.send(`🛡️ **نـقـــطـــة أمـــــان!** - تم حفظ الغنائم`).catch(()=>{});
    }

    // 3. العلاج وإزالة التأثيرات
    players.forEach(p => {
        if (!p.isDead) {
            const healAmount = Math.floor(p.maxHp * 0.30);
            p.hp = Math.min(p.maxHp, Math.floor(p.hp + healAmount));
            if (isNaN(p.hp)) p.hp = p.maxHp;

            p.effects = p.effects.filter(e => {
                if (e.floors) {
                    e.floors--;
                    if (e.floors <= 0) {
                        if (e.type === 'titan') {
                            p.maxHp = Math.floor(p.maxHp / 2);
                            if (p.hp > p.maxHp) p.hp = p.maxHp;
                            threadChannel.send(`✨ **${p.name}** عاد لحجمه الطبيعي وتلاشى مفعول العملاق.`).catch(()=>{});
                        }
                        return false; 
                    }
                }
                return true;
            });
        }
    });
}

/**
 * إدارة قائمة الاستراحة (الاستمرار/الانسحاب/المخيم)
 */
async function handleRestMenu(context) {
    const { 
        floor, players, retreatState, retreatedPlayers, 
        totalAccumulatedCoins, totalAccumulatedXP, 
        threadChannel, sql, guild, log,
        theme, 
        restImage 
    } = context;

    // 🔥 تعديل: الانسحاب متاح دائماً الآن
    const canRetreat = true;

    let restDesc = `✶ نجحتـم في تصفية الطابق الـ: **${floor}**\n✶ تم استعادة صحة المغامرين بنسبة **%30**\n\n**✶ الغنـائـم المتراكمة:**\n✬ Mora: **${totalAccumulatedCoins.toLocaleString()}** ${EMOJI_MORA}\n✬ XP: **${totalAccumulatedXP.toLocaleString()}** ${EMOJI_XP}`;

    // الأزرار
    const restRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('continue').setLabel('الاستمرار').setStyle(ButtonStyle.Success),
        // 🔥 زر نصب المخيم الجديد 🔥
        new ButtonBuilder().setCustomId('camp').setLabel('نصب مخيم (حفظ)').setStyle(ButtonStyle.Secondary).setEmoji('⛺'),
        new ButtonBuilder().setCustomId('retreat').setLabel('انسـحـاب').setStyle(ButtonStyle.Danger)
    );

    restDesc += `\n\n- القرار بيد **القائد** للاستمرار، نصب المخيم، أو الانسحاب.`;

    if (floor === 99) {
        restDesc += `\n\n⚠️💀 **تحذيـــر نهائـــي** 💀⚠️\nأنتم على أعتاب العرش... **الإمبراطور موراكس** بانتظاركم في الطابق القادم! لا تراجع بعد الآن!`;
    }

    // ✅ استخدام الصورة الجديدة (restImage) بدلاً من الرابط الثابت
    const finalImage = restImage || theme?.rest_image || 'https://i.postimg.cc/KcJ6gtzV/22.jpg';

    const restEmbed = new EmbedBuilder()
        .setTitle(`❖ استـراحـة بيـن الطـوابـق: ${theme?.name || 'مجهول'}`)
        .setDescription(restDesc)
        .setColor(theme?.color || Colors.Red) // ✅ استخدام لون الثيم
        .setImage(finalImage); // ✅ وضع الصورة الصحيحة

    let restMsg;
    try {
        restMsg = await threadChannel.send({ 
            content: '', 
            embeds: [restEmbed], 
            components: [restRow] 
        });
    } catch (err) { return 'end_error'; }

    const warningTimeout = setTimeout(() => {
        threadChannel.send("✶ الدانجـون سيبتلـعـكم بسبب الخمـول امام القائد 60 ثانية للاستمرار").catch(()=>{});
    }, 60000); 
      
    // انتظار القرار
    const decision = await new Promise(res => {
        const decCollector = restMsg.createMessageComponentCollector({ time: 120000 }); // 120 ثانية
        
        decCollector.on('collect', async i => {
            clearTimeout(warningTimeout); 

            // 1. خيار الاستمرار
            if (i.customId === 'continue') {
                let p = players.find(pl => pl.id === i.user.id);
                // 🔥 إصلاح التحذير: استخدام flags بدلاً من ephemeral
                if (!p || p.class !== 'Leader') return i.reply({ content: "🚫 **فقط القائد يمكنه اختيار الاستمرار!**", flags: [MessageFlags.Ephemeral] });
                await i.deferUpdate(); 
                return decCollector.stop('continue');
            }

            // 2. خيار نصب المخيم (جديد)
            if (i.customId === 'camp') {
                let p = players.find(pl => pl.id === i.user.id);
                if (!p || p.class !== 'Leader') return i.reply({ content: "🚫 **فقط القائد يمكنه نصب المخيم!**", flags: [MessageFlags.Ephemeral] });
                
                // حفظ البيانات في الداتابيس
                const nextFloor = floor + 1;
                // نحفظ بدم كامل (HP = MaxHP) لأننا سنعتبرهم ارتاحوا
                // لا نحتاج لحفظ الـ HP هنا لأننا سنعيد حسابه عند الاستكمال بناءً على معداتهم
                
                sql.prepare("INSERT OR REPLACE INTO dungeon_saves (hostID, guildID, floor, timestamp) VALUES (?, ?, ?, ?)").run(p.id, guild.id, nextFloor, Date.now());
                
                // رسالة عامة للجميع (بدون Ephemeral)
                await i.reply({ content: `⛺ **قام الفريق بنصب الخيام!**\nتم حفظ التقدم بنجاح. يمكنكم العودة لاستكمال الرحلة من الطابق **${nextFloor}** خلال 24 ساعة (أو أكثر حسب رتبة القائد).` });
                
                return decCollector.stop('camp'); // نوقف الكوليكتور ونرسل 'camp' كسبب
            }

            // 3. خيار الانسحاب
            if (i.customId === 'retreat') {
                let p = players.find(pl => pl.id === i.user.id);
                
                // إذا كان المنسحب هو القائد -> انسحاب جماعي
                if (p && p.class === 'Leader') {
                    await i.deferUpdate();
                    return decCollector.stop('retreat');
                } 
                // إذا كان عضواً عادياً -> انسحاب فردي
                else {
                    const pIndex = players.findIndex(pl => pl.id === i.user.id);
                    if (pIndex > -1) {
                        const leavingPlayer = players[pIndex];
                        leavingPlayer.retreatFloor = floor;
                        
                        const rewards = await handleMemberRetreat(leavingPlayer, floor, sql, guild.id, threadChannel);
                        
                        retreatedPlayers.push(leavingPlayer);
                        players.splice(pIndex, 1); 
                        
                        // 🔥 إصلاح التحذير هنا
                        await i.reply({ content: `👋 **انسحبت!** وحصلت على: **${rewards.mora}** مورا و **${rewards.xp}** XP.`, flags: [MessageFlags.Ephemeral] });
                        await threadChannel.send(`💨 **${leavingPlayer.name}** انسحب واكتفى بغنائمه!`).catch(()=>{});
                        
                        // إذا أصبح الفريق فارغاً
                        if (players.length === 0) decCollector.stop('retreat');
                        
                        // إذا انسحب شخص وأصبح أحدهم قائداً جديداً (في حال وجود منطق لذلك)
                        if (leavingPlayer.class === 'Leader') handleLeaderSuccession(players, log);
                    }
                }
            }
        });
        
        decCollector.on('end', (c, reason) => { clearTimeout(warningTimeout); res(reason); });
    });

    await restMsg.edit({ components: [] }).catch(()=>{});
      
    return decision;
}

module.exports = { applyPostBattleUpdates, handleRestMenu };
