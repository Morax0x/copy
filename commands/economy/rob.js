const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, Colors, SlashCommandBuilder } = require("discord.js");
// ✅ استدعاء هاندلر معركة الفارس (تأكد أن المسار صحيح)
const { startGuardBattle } = require('../../handlers/knight-battle');

const EMOJI_MORA = '<:mora:1435647151349698621>'; 
const EMPRESS_BOT_ID = "1434804075484020755"; // 👑 آيدي بوت الإمبراطورة (الهدف الجديد)
const REAL_OWNER_ID = "1145327691772481577"; // 👑 آيديك أنت (للحماية)

const MIN_CASH_PERCENT = 0.05;
const MAX_CASH_PERCENT = 0.10;
const MIN_BANK_PERCENT = 0.01;
const MAX_BANK_PERCENT = 0.05;
const ROBBER_FINE_PERCENT = 0.10;

const MIN_ROB_AMOUNT = 100;
const MIN_REQUIRED_CASH = 100; 
const COOLDOWN_MS = 1 * 60 * 60 * 1000; // ساعة واحدة

// خريطة لتخزين تاريخ آخر عفو
const robberyPardons = new Map(); 

// 🔥 مجموعة لمنع التكرار أثناء اللعب
const activeRobberies = new Set();

// --- دوال مساعدة للوقت ---
function getKSADateString() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });
}

function getNextMidnightTimestamp() {
    const now = new Date();
    const ksaTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Riyadh" }));
    const nextMidnight = new Date(ksaTime);
    nextMidnight.setHours(24, 0, 0, 0); 
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

// دالة لإرسال رسالة خاصة للضحية (تتجاهل البوتات)
async function sendDMToVictim(victim, messageContent) {
    try {
        if (victim.bot) return; // لا ترسل للبوت
        await victim.send(messageContent);
    } catch (error) {}
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
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            robber = message.member;
            victim = message.mentions.members.first();
        }

        const reply = async (payload) => {
            if (typeof payload === 'string') payload = { content: payload };
            if (isSlash) {
                if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
                return interaction.reply(payload);
            }
            else return message.reply(payload).catch(() => message.channel.send(payload));
        };

        if (!victim) return reply("الاستخدام: /سرقة <@user> أو -rob <@user>");

        // =================================================================
        // 🛑🛑 1. حماية الأونر الأصلي (إلغاء وتوجيه) 🛑🛑
        // =================================================================
        if (victim.id === REAL_OWNER_ID) {
            // حذف رسالة الأمر فوراً لتقليل الإزعاج
            if (!isSlash && message) await message.delete().catch(() => {});
            
            if (isSlash) await interaction.reply({ content: `🏰`, ephemeral: true });

            const redirectMsg = await interactionOrMessage.channel.send({
                content: `🏰 **تـم نـقـل قـصـر الامبراطـور الى حسـاب الامبراطورة!**\nحاول مجـددا ولكن منشن البوت <@${EMPRESS_BOT_ID}> ..`
            });
            
            // حذف رسالة التوجيه بعد 10 ثواني
            setTimeout(() => redirectMsg.delete().catch(() => {}), 10000);
            return;
        }

        // الآن نؤجل الرد للـ Slash (لأننا تجاوزنا حالة الأونر التي تتطلب رداً سريعاً)
        if (isSlash && !interaction.deferred && !interaction.replied) await interaction.deferReply();

        const sql = client.sql;

        // =================================================================
        // 🔥🔥 وضع الاختبار (سرقة النفس) 🔥🔥
        // =================================================================
        if (victim.id === robber.id) {
            if (robber.id === REAL_OWNER_ID) {
                const context = isSlash ? interaction : message;
                return await startGuardBattle(context, client, sql, robber, 5000);
            }
            return reply("تـسـرق نـفـسـك؟ غـبـي انـت؟؟ <:mirkk:1435648219488190525>");
        }

        if (activeRobberies.has(robber.id)) {
            return reply("🚫 **لديك عملية سطو جارية بالفعل!** أنهِها أولاً.");
        }

        const getScore = client.getLevel;
        const setScore = client.setLevel;

        let robberData = getScore.get(robber.id, guild.id) || { ...client.defaultData, user: robber.id, guild: guild.id };
        let victimData = getScore.get(victim.id, guild.id) || { ...client.defaultData, user: victim.id, guild: guild.id };

        // فحص ثروة السارق
        const robberTotalWealth = (robberData.mora || 0) + (robberData.bank || 0);
        if (robberTotalWealth < MIN_REQUIRED_CASH) {
             return reply(`❌ **لا يمكنك السرقة!**\nتحتاج إلى رصيد إجمالي لا يقل عن **${MIN_REQUIRED_CASH.toLocaleString()}** ${EMOJI_MORA} لتتمكن من دفع الغرامة.`);
        }

        // فحص الكولداون
        const now = Date.now();
        const timeLeft = (robberData.lastRob || 0) + COOLDOWN_MS - now;
        if (timeLeft > 0) {
            return reply(`🕐 حـرامـي مـجتـهد انـت <:stop:1436337453098340442> انتـظـر **\`${formatTime(timeLeft)}\`** عشان تسـوي عمـليـة سـطو ثـانيـة.`);
        }

        // فحص ثروة الضحية (نستثني البوت من هذا الفحص)
        if (victim.id !== EMPRESS_BOT_ID) {
            const victimTotalWealth = (victimData.mora || 0) + (victimData.bank || 0);
            if (victimTotalWealth < MIN_REQUIRED_CASH) {
                return reply(`❌ الضحية **${victim.displayName}** فقير جداً!`);
            }
        }

        // ✅ تسجيل العملية وبدء الكولداون
        activeRobberies.add(robber.id);
        robberData.lastRob = now;
        setScore.run(robberData); 

        // =================================================================
        // 👑👑 2. منطق سرقة الإمبراطورة (البوت) 👑👑
        // =================================================================
        if (victim.id === EMPRESS_BOT_ID) {
            
            // تحديد المبلغ (بين 100 و 9999)
            const minEmperor = 100;
            const maxEmperor = 9999;
            let amountToSteal = Math.floor(Math.random() * (maxEmperor - minEmperor + 1)) + minEmperor;
            
            // التأكد أن السارق يملك قيمة الغرامة
            if (amountToSteal > robberTotalWealth) {
                amountToSteal = robberTotalWealth;
            }

            const embed = new EmbedBuilder()
                .setTitle('❖ مـحاولـة سـطـو عـلـى قلـعة الامبراطـور')
                .setDescription(`✶ خـطـوة واحدة تفـصل بينـك وبين الغنيمة أو السجن.. ادخـل من أي بـاب من أبواب القلعـة... **${amountToSteal.toLocaleString()}** ${EMOJI_MORA}`)
                .setColor('#2F3136')
                .setImage('https://i.postimg.cc/0jQvvNNh/fort.jpg'); 

            const buttons = [];
            for (let i = 1; i <= 9; i++) {
                buttons.push(new ButtonBuilder().setCustomId(`rob_${i}`).setLabel('🚪').setStyle(ButtonStyle.Secondary));
            }
            // تقسيم الأزرار لصفوف
            const rows = [
                new ActionRowBuilder().addComponents(buttons.slice(0, 3)),
                new ActionRowBuilder().addComponents(buttons.slice(3, 6)),
                new ActionRowBuilder().addComponents(buttons.slice(6, 9))
            ];

            // تحديد الباب الصحيح عشوائياً
            const correctIndex = Math.floor(Math.random() * 9); 

            const msg = await reply({ embeds: [embed], components: rows });
            
            const filter = i => i.user.id === robber.id;
            const collector = msg.createMessageComponentCollector({ filter, componentType: ComponentType.Button, time: 20000, max: 1 });

            collector.on('collect', async i => {
                const clickedIndex = parseInt(i.customId.split('_')[1]) - 1;

                if (clickedIndex === correctIndex) {
                    // ✅ نجاح (نظام مكافأة البوت)
                    // نضيف المال للسارق فقط (توليد) ولا نخصم من البوت
                    robberData.mora += amountToSteal;
                    setScore.run(robberData);

                    const winEmbed = new EmbedBuilder()
                        .setTitle('❖ سـطـو نـاجـح !')
                        .setColor(Colors.Green)
                        .setImage('https://i.postimg.cc/QVLQyyDK/rob.gif')
                        .setDescription(`لقد تمكنت من التسلل وسرقة **${amountToSteal.toLocaleString()}** ${EMOJI_MORA} من خزانة الإمبراطور!`);
                    
                    await i.update({ embeds: [winEmbed], components: [] });
                    activeRobberies.delete(robber.id); // إنهاء

                } else {
                    // ❌ فشل
                    const todayDate = getKSADateString(); 
                    const lastPardonDate = robberyPardons.get(robber.id); 
                    const canBePardoned = lastPardonDate !== todayDate;

                    if (canBePardoned) {
                        // عفو إمبراطوري
                        robberData.mora += 100;
                        setScore.run(robberData);
                        robberyPardons.set(robber.id, todayDate);

                        const nextMidnightTimestamp = getNextMidnightTimestamp();
                        const pardonEmbed = new EmbedBuilder()
                            .setTitle('❖ مـحاولـة سـطـو فـاشـلـة')
                            .setColor('#FFD700')
                            .setImage('https://i.postimg.cc/cLky0W3d/mor.gif')
                            .setDescription(
                                `✶ أمسك بك الفرسان وأنت تحاول السطو على القلعة ولكن **عفا عنك الإمبراطور** وأعطاك 100 ${EMOJI_MORA}\n\n` +
                                `★ فـرسـان الامبراطـور يراقبـونـك حـتـى : <t:${nextMidnightTimestamp}:R>`
                            );
                        await i.update({ embeds: [pardonEmbed], components: [] });
                        activeRobberies.delete(robber.id); // إنهاء

                    } else {
                        // 🔥🔥 معركة الفارس 🔥🔥
                        await msg.delete().catch(() => {});
                        activeRobberies.delete(robber.id); // تنظيف قبل المعركة
                        
                        // بدء المعركة (هنا يتم التعامل مع الخسارة في ملف knight-battle.js)
                        const context = isSlash ? interaction : message;
                        return await startGuardBattle(context, client, sql, robber, amountToSteal);
                    }
                }
            });

            collector.on('end', (collected, reason) => {
                activeRobberies.delete(robber.id);
                if (reason === 'time') {
                    // انتهاء الوقت = خسارة للسارق فقط
                    deductFromRobber(robberData, amountToSteal);
                    setScore.run(robberData);
                    
                    const timeEmbed = new EmbedBuilder()
                        .setTitle('⏰ فات الأوان!')
                        .setColor(Colors.Red)
                        .setDescription(`تأخرت في الاختيار فأمسك بك الحراس! خسرت **${amountToSteal}** ${EMOJI_MORA}.`);
                    
                    msg.edit({ embeds: [timeEmbed], components: [] }).catch(()=>{});
                }
            });

            return; // إنهاء دالة rob هنا لأننا دخلنا مسار الإمبراطورة
        }

        // =================================================================
        // 🔹 3. المنطق العادي للأعضاء (بين اللاعبين) 🔹
        // =================================================================

        const victimMora = victimData.mora || 0;
        const victimBank = victimData.bank || 0;
        let amountToSteal = 0;
        let targetPool, poolName, victimPoolAmount;
        
        if (victimBank >= MIN_REQUIRED_CASH && victimMora >= MIN_REQUIRED_CASH) {
            targetPool = Math.random() < 0.5 ? 'mora' : 'bank';
        } else if (victimBank >= MIN_REQUIRED_CASH) {
            targetPool = 'bank';
        } else {
            targetPool = 'mora';
        }

        victimPoolAmount = targetPool === 'bank' ? victimBank : victimMora;
        poolName = targetPool === 'bank' ? "البنك" : "الكاش";

        const robberCap = Math.floor(robberTotalWealth * ROBBER_FINE_PERCENT);
        let victimCap;

        if (targetPool === 'bank') {
            const randomPercent = Math.random() * (MAX_BANK_PERCENT - MIN_BANK_PERCENT) + MIN_BANK_PERCENT;
            victimCap = Math.floor(victimPoolAmount * randomPercent);
        } else {
            const randomPercent = Math.random() * (MAX_CASH_PERCENT - MIN_CASH_PERCENT) + MIN_CASH_PERCENT;
            victimCap = Math.floor(victimPoolAmount * randomPercent);
        }

        amountToSteal = Math.min(robberCap, victimCap);
        if (amountToSteal < MIN_ROB_AMOUNT) {
             if (victimPoolAmount >= MIN_ROB_AMOUNT) amountToSteal = MIN_ROB_AMOUNT;
             else {
                 activeRobberies.delete(robber.id);
                 return reply(`❌ الضحية لا يملك ما يكفي لسرقته في ${poolName}!`);
             }
        }

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
            
            // فخ الحارس (إذا كان لدى الضحية حارس مشتري)
            if (victimData.hasGuard > 0) {
                deductFromRobber(robberData, amountToSteal);
                victimData.mora += amountToSteal;
                
                victimData.hasGuard -= 1; 
                const guardLeft = victimData.hasGuard;
                if (guardLeft === 0) victimData.guardExpires = 0;
                setScore.run(victimData);
                setScore.run(robberData);

                let guardStatusMsg = guardLeft === 0 
                    ? "- انتهى عقـد الحراسـة يسعدنـا ان توقـع عقد حراسـة جديد معنا لحماية ممتلكاتك" 
                    : `- ينتهي عقد الحراسة بعد: ${guardLeft} مرات`;

                const guardEmbed = new EmbedBuilder()
                    .setTitle('✶ تــم الـقـبـض :shield: !')
                    .setColor('#46455f')
                    .setImage('https://i.postimg.cc/Hx6tZnJv/nskht-mn-ambratwryt-alanmy.jpg')
                    .setDescription(`✬ دخلت من الباب الخطـا ووجدت الحارس الشخصي بانتظارك! <:catla:1437335118153781360>\n\n✬ تـم القبض عليك وتغريـمك **${amountToSteal.toLocaleString()}** ${EMOJI_MORA} واعطـائـها للضحـية`);
                
                await i.update({ embeds: [guardEmbed], components: [] });
                sendDMToVictim(victim, `✥ حـاول ${robber} السـطو عـلى ممتلكـاتك ولكـن الحـارس امسك به واخذ **${amountToSteal}** منه واعطاها لك\n${guardStatusMsg}`);

            } else {
                // السرقة العادية
                if (clickedIndex === correctButtonIndex) {
                    // نجاح
                    robberData.mora += amountToSteal;
                    
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

                    const winEmbed = new EmbedBuilder()
                        .setTitle('✅ حـرامـي مـحـتـرف <:thief:1436331309961187488>')
                        .setColor(Colors.Orange)
                        .setImage('https://i.postimg.cc/QVLQyyDK/rob.gif')
                        .setDescription(`لقد اخترت الباب الصحيح وسرقت **${amountToSteal.toLocaleString()}** ${EMOJI_MORA} من ${victim.displayName}!`);
                    
                    await i.update({ embeds: [winEmbed], components: [] });
                    sendDMToVictim(victim, `✥ قـام ${robber} بالسـطو عـلى ممتلـكـاتك وسـرق **${amountToSteal}**`);

                } else {
                    // فشل (قنبلة)
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
            activeRobberies.delete(robber.id);
        });

        collector.on('end', (collected, reason) => {
            activeRobberies.delete(robber.id);
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
