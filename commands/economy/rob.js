const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, Colors, SlashCommandBuilder } = require("discord.js");
// ✅ استدعاء هاندلر المعركة (تأكد من تعديل اسم الملف لاحقاً إذا غيرته)
const { startGuardBattle } = require('../../handlers/guard-battle');

const EMOJI_MORA = '<:mora:1435647151349698621>'; // تأكد من صحة الايدي
const OWNER_ID = "1145327691772481577"; // 👑 آيدي الأونر

// إعدادات النسب والمبالغ
const MIN_CASH_PERCENT = 0.05;
const MAX_CASH_PERCENT = 0.10;
const MIN_BANK_PERCENT = 0.01;
const MAX_BANK_PERCENT = 0.05;
const ROBBER_FINE_PERCENT = 0.10;

const MIN_ROB_AMOUNT = 100;
const MIN_REQUIRED_CASH = 100; 
const COOLDOWN_MS = 1 * 60 * 60 * 1000; // ساعة واحدة

// خريطة لتخزين تاريخ آخر عفو (YYYY-MM-DD) - يتم تصفيرها تلقائياً عند إعادة تشغيل البوت
// *ملاحظة: إذا أردت حفظ العفو حتى بعد إعادة التشغيل، يجب تخزينه في قاعدة البيانات*
const robberyPardons = new Map(); 

// --- دوال مساعدة للوقت (توقيت السعودية) ---
function getKSADateString() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });
}

function getNextMidnightTimestamp() {
    const now = new Date();
    const ksaTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Riyadh" }));
    const nextMidnight = new Date(ksaTime);
    nextMidnight.setHours(24, 0, 0, 0); // منتصف الليل القادم
    return Math.floor((Date.now() + (nextMidnight.getTime() - ksaTime.getTime())) / 1000);
}

function formatTime(ms) {
    if (ms < 0) ms = 0;
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const hh = String(hours).padStart(2, '0');
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');

    if (hours > 0) return `${hh}:${mm}:${ss}`;
    return `${mm}:${ss}`;
}

function deductFromRobber(data, amount) {
    if (data.mora >= amount) {
        data.mora -= amount;
    } else {
        const remaining = amount - data.mora;
        data.mora = 0; 
        data.bank = Math.max(0, data.bank - remaining); 
    }
    return data;
}

// دالة لإرسال رسالة خاصة للضحية
async function sendDMToVictim(victim, messageContent) {
    try {
        await victim.send(messageContent);
    } catch (error) {
        // تجاهل الخطأ إذا كان الخاص مغلق
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('سرقة')
        .setDescription('محاولة سرقة المورا من عضو آخر.')
        .addUserOption(option => 
            option.setName('الضحية')
            .setDescription('العضو الذي تريد سرقته')
            .setRequired(true)),

    name: 'rob',
    aliases: ['سرقة', 'نهب'],
    category: "Economy",
    description: 'محاولة سرقة المورا من عضو آخر.',

    async execute(interactionOrMessage, args) {

        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, robber, victim;

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            robber = interaction.member;
            victim = interaction.options.getMember('الضحية');
            await interaction.deferReply();
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            robber = message.member;
            victim = message.mentions.members.first();
        }

        // 🔥 حذف رسالة العضو فوراً إذا كان المنشن للأونر (للحفاظ على هيبة القلعة)
        if (!isSlash && message && victim && victim.id === OWNER_ID) {
            await message.delete().catch(() => {});
        }

        const reply = async (payload) => {
            if (typeof payload === 'string') payload = { content: payload };
            if (isSlash) return interaction.editReply(payload);
            else return message.reply(payload).catch(() => message.channel.send(payload));
        };

        const sql = client.sql;

        if (!victim) return reply("الاستخدام: /سرقة <@user> أو -rob <@user>");
        if (victim.id === robber.id) return reply("تـسـرق نـفـسـك؟ غـبـي انـت؟؟ <:mirkk:1435648219488190525>");

        const getScore = client.getLevel;
        const setScore = client.setLevel;

        let robberData = getScore.get(robber.id, guild.id) || { ...client.defaultData, user: robber.id, guild: guild.id };
        let victimData = getScore.get(victim.id, guild.id) || { ...client.defaultData, user: victim.id, guild: guild.id };

        // 1. فحص ثروة السارق (يجب أن يملك الحد الأدنى لدفع الغرامة)
        const robberTotalWealth = (robberData.mora || 0) + (robberData.bank || 0);
        if (robberTotalWealth < MIN_REQUIRED_CASH) {
             return reply(`❌ **لا يمكنك السرقة!**\nتحتاج إلى رصيد إجمالي لا يقل عن **${MIN_REQUIRED_CASH.toLocaleString()}** ${EMOJI_MORA} لتتمكن من دفع الغرامة في حال فشلت.`);
        }

        // 2. فحص وقت الانتظار (Cooldown)
        const now = Date.now();
        const timeLeft = (robberData.lastRob || 0) + COOLDOWN_MS - now;
        if (timeLeft > 0) {
            return reply(`🕐 حـرامـي مـجتـهد انـت <:stop:1436337453098340442> انتـظـر **\`${formatTime(timeLeft)}\`** عشان تسـوي عمـليـة سـطو ثـانيـة.`);
        }

        // 3. فحص ثروة الضحية
        const victimTotalWealth = (victimData.mora || 0) + (victimData.bank || 0);
        if (victimTotalWealth < MIN_REQUIRED_CASH) {
            return reply(`❌ الضحية **${victim.displayName}** فقير جداً! لا يوجد شيء لسرقته.`);
        }

        // --- حساب المبلغ المراد سرقته ---
        const victimMora = victimData.mora || 0;
        const victimBank = victimData.bank || 0;
        let targetPool, poolName, victimPoolAmount;
        
        // تحديد الهدف (كاش أو بنك)
        if (victimBank >= MIN_REQUIRED_CASH && victimMora >= MIN_REQUIRED_CASH) {
            targetPool = Math.random() < 0.5 ? 'mora' : 'bank';
        } else if (victimBank >= MIN_REQUIRED_CASH) {
            targetPool = 'bank';
        } else {
            targetPool = 'mora';
        }

        victimPoolAmount = targetPool === 'bank' ? victimBank : victimMora;
        poolName = targetPool === 'bank' ? "البنك" : "الكاش";

        // حساب الحد الأقصى للسرقة
        const robberCap = Math.floor(robberTotalWealth * ROBBER_FINE_PERCENT); // لا يمكن سرقة أكثر من 10% من ثروة السارق (كحد للمخاطرة)
        let victimCap;

        if (targetPool === 'bank') {
            const randomPercent = Math.random() * (MAX_BANK_PERCENT - MIN_BANK_PERCENT) + MIN_BANK_PERCENT;
            victimCap = Math.floor(victimPoolAmount * randomPercent);
        } else {
            const randomPercent = Math.random() * (MAX_CASH_PERCENT - MIN_CASH_PERCENT) + MIN_CASH_PERCENT;
            victimCap = Math.floor(victimPoolAmount * randomPercent);
        }

        let amountToSteal = Math.min(robberCap, victimCap);
        if (amountToSteal < MIN_ROB_AMOUNT) {
             if (victimPoolAmount >= MIN_ROB_AMOUNT) amountToSteal = MIN_ROB_AMOUNT;
             else return reply(`❌ الضحية لا يملك ما يكفي لسرقته في ${poolName}!`);
        }

        // تحديث وقت آخر سرقة
        robberData.lastRob = now;

        // =================================================================
        // 🔥🔥 منطق سرقة الإمبراطور (الأونر) 🔥🔥
        // =================================================================
        if (victim.id === OWNER_ID) {
            
            const embed = new EmbedBuilder()
                .setTitle('❖ مـحاولـة سـطـو عـلـى قلـعة الامبراطـور')
                .setDescription(`✶ خـطـوة واحدة تفـصل بينـك وبين الغنيمة أو السجن.. ادخـل من أي بـاب من أبواب القلعـة... **${amountToSteal.toLocaleString()}** ${EMOJI_MORA}`)
                .setColor('#2F3136')
                .setImage('https://i.postimg.cc/0jQvvNNh/fort.jpg'); // صورة القلعة

            // إنشاء أزرار الأبواب (9 أبواب)
            const rows = [];
            const buttons = [];
            for (let i = 1; i <= 9; i++) {
                buttons.push(new ButtonBuilder().setCustomId(`rob_${i}`).setLabel('🚪').setStyle(ButtonStyle.Secondary));
            }
            rows.push(new ActionRowBuilder().addComponents(buttons.slice(0, 3)));
            rows.push(new ActionRowBuilder().addComponents(buttons.slice(3, 6)));
            rows.push(new ActionRowBuilder().addComponents(buttons.slice(6, 9)));

            // خلط الأبواب وتحديد الصحيحة (بابين صحيحين فقط)
            const allIndices = [0, 1, 2, 3, 4, 5, 6, 7, 8];
            for (let i = allIndices.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [allIndices[i], allIndices[j]] = [allIndices[j], allIndices[i]];
            }
            const correctIndices = allIndices.slice(0, 2); 

            const msg = await reply({ embeds: [embed], components: rows });
            const filter = i => i.user.id === robber.id;
            const collector = msg.createMessageComponentCollector({ filter, componentType: ComponentType.Button, time: 20000, max: 1 });

            collector.on('collect', async i => {
                const clickedIndex = parseInt(i.customId.split('_')[1]) - 1;

                if (correctIndices.includes(clickedIndex)) {
                    // ✅ نجاح السرقة من الأونر
                    if (targetPool === 'bank') {
                        if (victimData.bank >= amountToSteal) victimData.bank -= amountToSteal;
                        else {
                            const remainder = amountToSteal - victimData.bank;
                            victimData.bank = 0;
                            victimData.mora = Math.max(0, victimData.mora - remainder);
                        }
                    } else {
                        if (victimData.mora >= amountToSteal) victimData.mora -= amountToSteal;
                        else {
                            const remainder = amountToSteal - victimData.mora;
                            victimData.mora = 0;
                            victimData.bank = Math.max(0, victimData.bank - remainder);
                        }
                    }
                    robberData.mora += amountToSteal;

                    const winEmbed = new EmbedBuilder()
                        .setTitle('❖ سـطـو نـاجـح !')
                        .setColor(Colors.Green)
                        .setImage('https://i.postimg.cc/QVLQyyDK/rob.gif')
                        .setDescription(`لقد تمكنت من التسلل وسرقة **${amountToSteal.toLocaleString()}** ${EMOJI_MORA} من خزانة الإمبراطور!`);
                    
                    await i.update({ embeds: [winEmbed], components: [] });

                } else {
                    // ❌ فشل السرقة من الأونر
                    const todayDate = getKSADateString(); 
                    const lastPardonDate = robberyPardons.get(robber.id); 
                    
                    // هل يستحق العفو؟ (إذا لم يحصل عليه اليوم)
                    const canBePardoned = lastPardonDate !== todayDate;

                    if (canBePardoned) {
                        // --- السيناريو الأول: العفو الإمبراطوري (أول مرة) ---
                        robberData.mora += 100; // منحة العفو
                        robberyPardons.set(robber.id, todayDate); // تسجيل العفو

                        const nextMidnightTimestamp = getNextMidnightTimestamp();

                        const pardonEmbed = new EmbedBuilder()
                            .setTitle('❖ مـحاولـة سـطـو فـاشـلـة')
                            .setColor('#FFD700') // ذهبي
                            .setImage('https://i.postimg.cc/cLky0W3d/mor.gif')
                            .setDescription(
                                `✶ أمسك بك الحراس وأنت تحاول السطو على القلعة ولكن **عفا عنك الإمبراطور** وأعطاك 100 ${EMOJI_MORA}\n\n` +
                                `⚠️ **تحذير:** إذا عدت للسرقة اليوم سيظهر لك **فارس الإمبراطور**!\n` +
                                `★ يتجدد العفو في: <t:${nextMidnightTimestamp}:R>`
                            );

                        await i.update({ embeds: [pardonEmbed], components: [] });

                    } else {
                        // --- السيناريو الثاني: الفشل بعد العفو (ظهور فارس الإمبراطور) ---
                        
                        // 1. حذف رسالة الأبواب
                        await msg.delete().catch(() => {});

                        // 2. بدء معركة فارس الإمبراطور
                        // سيتم استخدام الهاندلر لإظهار الفارس بدلاً من الخسارة المباشرة
                        const context = isSlash ? interaction : message;
                        return await startGuardBattle(context, client, sql, robber, amountToSteal);
                    }
                }
                setScore.run(robberData);
                setScore.run(victimData);
            });

            collector.on('end', (collected, reason) => {
                if (reason === 'time') {
                    // انتهاء الوقت للأونر = خسارة مباشرة
                    deductFromRobber(robberData, amountToSteal);
                    victimData.mora += amountToSteal;
                    setScore.run(robberData);
                    setScore.run(victimData);
                    
                    const timeEmbed = new EmbedBuilder()
                        .setTitle('⏰ فات الأوان!')
                        .setColor(Colors.Red)
                        .setDescription(`تأخرت في الاختيار فأمسك بك الحراس! خسرت **${amountToSteal}** ${EMOJI_MORA}.`);
                    
                    msg.edit({ embeds: [timeEmbed], components: [] }).catch(()=>{});
                }
            });

            return; // إنهاء التنفيذ هنا لأن المنطق خاص بالأونر
        }

        // =================================================================
        // 🔹 المنطق العادي للأعضاء (بما في ذلك حارس المتجر) 🔹
        // =================================================================

        let descArray = [
            `✦ انـت تسـطو علـى ممتـلكـات: ${victim} <:thief:1436331309961187488>`,
            `⌕ اخـتـر البـاب الصحـيـح الـذي يحـوي عـلـى ${amountToSteal.toLocaleString()} ${EMOJI_MORA} (من ${poolName})!`,
            `لديـك 15 ثانيـة لاختيـار البـاب الصحيـح :bomb:`
        ];

        if (targetPool === 'bank') {
            descArray.push(`🔒 حماية البنك عالية لذا نسبة نجاح السرقة أقل.`);
        }

        const description = descArray.join('\n');

        const embed = new EmbedBuilder()
            .setTitle('✥ عملـيـة سـطـو ...')
            .setDescription(description)
            .setColor('#8B4513')
            .setImage('https://i.postimg.cc/mkRP0fq6/door.gif');

        const buttons = [
            new ButtonBuilder().setCustomId('rob_1').setLabel('🚪').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('rob_2').setLabel('🚪').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('rob_3').setLabel('🚪').setStyle(ButtonStyle.Secondary)
        ];

        const correctButtonIndex = Math.floor(Math.random() * 3);

        const row = new ActionRowBuilder().addComponents(buttons);
        const msg = await reply({ embeds: [embed], components: [row] });

        const filter = i => i.user.id === robber.id;
        const collector = msg.createMessageComponentCollector({ filter, componentType: ComponentType.Button, time: 15000, max: 1 });

        collector.on('collect', async i => {
            const clickedIndex = parseInt(i.customId.split('_')[1]) - 1;
            
            // =================================================
            // 🔥🔥 نظام الحارس الشخصي (الذي يشتريه الأعضاء) 🔥🔥
            // =================================================
            if (victimData.hasGuard > 0) {
                // 1. خصم شحنة واحدة من الحارس
                victimData.hasGuard -= 1; 
                // إذا اشترى العضو 3 حراس، سيصبح الرقم 2، ثم 1، ثم 0 (يعني يحميه 3 مرات)
                
                if (victimData.hasGuard === 0) victimData.guardExpires = 0;
                setScore.run(victimData);

                // 2. حذف رسالة الأبواب
                await msg.delete().catch(() => {});

                // 3. بدء معركة الحارس
                const context = isSlash ? interaction : message;
                return await startGuardBattle(context, client, sql, robber, amountToSteal);

            } else {
                // المنطق العادي إذا لم يكن لدى الضحية حارس
                if (clickedIndex === correctButtonIndex) {
                    // ✅ نجاح
                    const finalAmount = amountToSteal;
                    robberData.mora += finalAmount;
                    
                    if (targetPool === 'bank') {
                        if (victimData.bank >= finalAmount) victimData.bank -= finalAmount;
                        else {
                            const remainder = finalAmount - victimData.bank;
                            victimData.bank = 0;
                            victimData.mora = Math.max(0, victimData.mora - remainder);
                        }
                    } else {
                        if (victimData.mora >= finalAmount) victimData.mora -= finalAmount;
                        else {
                            const remainder = finalAmount - victimData.mora;
                            victimData.mora = 0;
                            victimData.bank = Math.max(0, victimData.bank - remainder);
                        }
                    }

                    const winEmbed = new EmbedBuilder()
                        .setTitle('✅ حـرامـي مـحـتـرف <:thief:1436331309961187488>')
                        .setColor(Colors.Orange)
                        .setImage('https://i.postimg.cc/QVLQyyDK/rob.gif')
                        .setDescription(`لقد اخترت الباب الصحيح وسرقت **${finalAmount.toLocaleString()}** ${EMOJI_MORA} من ${victim.displayName}!`);
                    
                    await i.update({ embeds: [winEmbed], components: [] });

                    sendDMToVictim(victim, `✥ قـام ${robber} بالسـطو عـلى ممتلـكـاتك وسـرق **${finalAmount}**`);

                } else {
                    // ❌ فشل (قنبلة)
                    deductFromRobber(robberData, amountToSteal);
                    victimData.mora += amountToSteal;

                    const loseEmbed = new EmbedBuilder()
                        .setTitle('💥 بــــووم !')
                        .setColor(Colors.Red)
                        .setImage('https://i.postimg.cc/HkdZWrG5/boom.gif')
                        .setDescription(`لقد اخترت الباب الخطأ وانفجرت القنبلة!\n\nفشلت السرقة، وتم تغريمك **${amountToSteal.toLocaleString()}** ${EMOJI_MORA} وإعطاؤها للضحية.`);
                    await i.update({ embeds: [loseEmbed], components: [] });

                    sendDMToVictim(victim, `✥ حـاول ${robber} السـطـو عـلى ممتلكـاتك ولكنـه فـشل وحصـلت علـى **${amountToSteal}** كـ تعويض`);
                }
            }
            setScore.run(robberData);
            setScore.run(victimData);
        });

        collector.on('end', (collected, reason) => {
            if (reason === 'time') {
                deductFromRobber(robberData, amountToSteal);
                victimData.mora += amountToSteal;
                setScore.run(robberData);
                setScore.run(victimData);

                const timeEmbed = new EmbedBuilder()
                    .setTitle('⏰ انتهى الوقت!')
                    .setColor(Colors.Red)
                    .setImage('https://i.postimg.cc/Hx6tZnJv/nskht-mn-ambratwryt-alanmy.jpg')
                    .setDescription(`لقد ترددت طويلاً وتم القبض عليك!\n\nفشلت السرقة، وتم تغريمك **${amountToSteal.toLocaleString()}** ${EMOJI_MORA} وإعطاؤها للضحية.`);

                msg.edit({ embeds: [timeEmbed], components: [] }).catch(()=>{});
                
                sendDMToVictim(victim, `✥ حـاول ${robber} السـطـو عـلى ممتلكـاتك ولكنـه فـشل (تأخر في الوقت) وحصـلت علـى **${amountToSteal}** كـ تعويض`);
            }
        });
    }
};
