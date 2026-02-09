// handlers/dungeon/core/end-game.js

const { EmbedBuilder } = require('discord.js');
const { getRandomImage } = require('../utils'); 
const { 
    EMOJI_MORA, 
    EMOJI_XP, 
    EMOJI_BUFF, 
    EMOJI_NERF, 
    WIN_IMAGES, 
    LOSE_IMAGES 
} = require('../constants'); 

async function sendEndMessage(mainChannel, thread, activePlayers, retreatedPlayers, floor, status, sql, guildId, hostId, activeDungeonRequests) {
    if (!sql || !sql.open) return;
    
    let title = "", color = "", randomImage = null;

    if (status === 'win') { 
        title = "❖ أسطـورة الدانـجون !"; 
        // 🔥 توليد لون عشوائي عند الفوز 🔥
        const randomHex = Math.floor(Math.random() * 16777215).toString(16);
        color = `#${randomHex}`; 
        randomImage = getRandomImage(WIN_IMAGES); 
    } 
    else if (status === 'retreat') { 
        title = "❖ انـسـحـاب تـكـتيـكـي !"; 
        color = "#FFFF00"; 
        randomImage = getRandomImage(WIN_IMAGES); 
    } 
    // 🔥🔥 حالة نصب المخيم الجديدة 🔥🔥
    else if (status === 'camp') {
        title = "⛺ استـراحـة محـارب - تـم نصـب المخيـم";
        color = "#00FF00"; // لون أخضر
        randomImage = "https://i.postimg.cc/KcJ6gtzV/22.jpg"; // صورة المخيم
    }
    else { 
        title = "❖ هزيمـة ساحقـة ..."; 
        color = "#FF0000"; 
        randomImage = getRandomImage(LOSE_IMAGES); 
    }

    const allParticipants = [...activePlayers, ...retreatedPlayers];
    
    let mvpPlayer = allParticipants.length > 0 ? allParticipants.reduce((p, c) => (p.totalDamage > c.totalDamage) ? p : c) : null;
    
    let lootString = "";
    allParticipants.forEach(p => {
        let finalMora = 0;
        let finalXp = 0;

        // التحقق هل تم توزيع الجوائز مسبقاً؟ (عبر rewards.js)
        if (p.rewardsClaimed) {
            finalMora = p.finalMora || 0;
            finalXp = p.finalXp || 0;
        } else {
            // الحساب اليدوي في حال لم يمر عبر rewards.js (مثل الخسارة المفاجئة أو المخيم)
            
            // في حالة الخسارة بعد طابق 20، تعويض بسيط
            if (status === 'lose' && floor > 20) {
                finalMora = 1000;
                finalXp = 100;
            } else {
                finalMora = Math.floor(p.loot.mora || 0);
                finalXp = Math.floor(p.loot.xp || 0);
                
                if (p.isDead) { 
                    finalMora = Math.floor(finalMora * 0.5); 
                    finalXp = Math.floor(finalXp * 0.5); 
                }
            }
            
            // حفظ في الداتابيس
            sql.prepare("UPDATE levels SET xp = xp + ?, mora = mora + ? WHERE user = ? AND guild = ?").run(finalXp, finalMora, p.id, guildId);
        }
        
        let statusEmoji = "";
        if (p.isDead) { 
            const deathFloorInfo = p.deathFloor ? `(مات في ${p.deathFloor})` : "(مات)";
            statusEmoji = `💀 ${deathFloorInfo}`;
        } else if (p.retreatFloor) {
            statusEmoji = `🏃‍♂️ (انسحب في ${p.retreatFloor})`;
        } else if (status === 'camp') {
            statusEmoji = "⛺ (مخيم)";
        } else {
            statusEmoji = "✅";
        }

        lootString += `✬ <@${p.id}> ${statusEmoji}: ${finalMora.toLocaleString()} ${EMOJI_MORA} | ${finalXp.toLocaleString()} XP\n`;
    });

    let description = `**الطابق:** ${floor}\n\n**✶ تقـريـر المعـركـة:**\nنجم المعركة: ${mvpPlayer ? `<@${mvpPlayer.id}>` : 'N/A'}\n\n${lootString}`;

    // إضافة ملاحظة خاصة للمخيم
    if (status === 'camp') {
        description += `\n\n📝 **ملاحظة:** تم حفظ تقدمكم عند الطابق **${floor + 1}**. يمكن للقائد استكمال الرحلة لاحقاً.`;
    }

    // 🔥🔥🔥 تعديل رسالة نجم المعركة والجائزة الإضافية 🔥🔥🔥
    if (floor >= 10 && mvpPlayer && status !== 'camp') { // لا نعطي MVP عند التخييم (لأنه لم ينتهِ)
        let extraRewardText = "";
        
        // التحقق إذا الضرر تجاوز 10000
        if (mvpPlayer.totalDamage > 10000) {
            extraRewardText = " + 500 مـورا";
            // إضافة 500 مورا لرصيد اللاعب فوراً
            sql.prepare("UPDATE levels SET mora = mora + 500 WHERE user = ? AND guild = ?").run(mvpPlayer.id, guildId);
        }

        description += `\n\n<a:mTrophy:1438797228826300518> **نجـم المعركـة:**\n✶ <@${mvpPlayer.id}> (الـضـرر: ${mvpPlayer.totalDamage.toLocaleString()})\nحـصـل عـلى تعـزيـز 15% مورا واكس بي لـ 15د${extraRewardText} <a:buff:1438796257522094081>`;
    }

    // إضافة نص اللعنة داخل الإيمبد في حالة الخسارة
    if (floor >= 10 && status === 'lose') {
        description += `\n\n**💀 لعنـة الهزيمـة:**\nأصابت اللعنة جميع المشاركين! (-15% مورا واكس بي لـ 15د) ${EMOJI_NERF}`;
        
        // تطبيق اللعنة في قاعدة البيانات (صامت)
        const debuffDuration = 15 * 60 * 1000;
        const expiresAt = Date.now() + debuffDuration;
        allParticipants.forEach(p => {
            sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(guildId, p.id, -15, expiresAt, 'mora', -0.15);
            sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(guildId, p.id, -15, expiresAt, 'xp', -0.15);
        });
    }

    if (floor >= 10 && status !== 'lose' && status !== 'camp' && mvpPlayer) {
        // تطبيق البف الخاص بنجم المعركة (15%) - لا يطبق عند التخييم
        const buffDuration = 15 * 60 * 1000; 
        const expiresAt = Date.now() + buffDuration;
        sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(guildId, mvpPlayer.id, 15, expiresAt, 'mora', 0.15);
        sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)").run(guildId, mvpPlayer.id, 15, expiresAt, 'xp', 0.15);
    }

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color) // سيأخذ اللون العشوائي عند الفوز
        .setImage(randomImage)
        .setTimestamp();

    await mainChannel.send({ content: allParticipants.map(p => `<@${p.id}>`).join(' '), embeds: [embed] }).catch(()=>{});
    
    // تنظيف الطلب
    if (activeDungeonRequests && activeDungeonRequests.has(hostId)) {
        activeDungeonRequests.delete(hostId);
    }
    
    try {
        if (status === 'camp') {
            await thread.send({ content: `**⛺ تم حفظ التقدم وإغلاق البوابة مؤقتاً. نراكم قريباً!**` });
        } else {
            await thread.send({ content: `**✶ انتهت الرحلة، سيتم إغلاق البوابة غـادروا بسرعة <:emoji_69:1451172248173023263> ...**` });
        }
        setTimeout(() => { thread.delete().catch(()=>{}); }, 10000); 
    } catch(e) { }
}

module.exports = { sendEndMessage };
