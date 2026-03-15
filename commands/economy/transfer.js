const { EmbedBuilder, SlashCommandBuilder } = require("discord.js");

let updateGuildStat;
try {
    ({ updateGuildStat } = require('../../handlers/guild-board-handler.js'));
} catch (e) {}

const BASE_TAX_RATE = 0.03; 
const COOLDOWN_MS = 5 * 60 * 1000; 

module.exports = {
    data: new SlashCommandBuilder()
        .setName('تحويل')
        .setDescription('تحول مورا إلى عضو آخر (أول تحويل يومياً مجاني، الباقي 3%).')
        .addUserOption(option =>
            option.setName('المستلم')
            .setDescription('العضو الذي تريد التحويل له')
            .setRequired(true))
        .addIntegerOption(option =>
            option.setName('المبلغ')
            .setDescription('المبلغ الذي تريد تحويله')
            .setRequired(true)
            .setMinValue(1)),

    name: 'transfer',
    aliases: ['تحويل', 'c'],
    category: "Economy",
    description: 'تحول مورا إلى عضو آخر لحظياً.',

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, sender, db, senderMember;
        let receiver, amount;

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            db = client.sql; 
            sender = interaction.user;
            senderMember = interaction.member;
            receiver = interaction.options.getMember('المستلم');
            amount = interaction.options.getInteger('المبلغ');
            await interaction.deferReply();
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            db = client.sql; 
            sender = message.author;
            senderMember = message.member;
            receiver = message.mentions.members.first();
            amount = parseInt(args[1]);
        }

        const reply = async (payload) => {
            if (isSlash) {
                if (interaction.replied || interaction.deferred) return interaction.editReply(payload);
                return interaction.reply(payload);
            } else {
                return message.channel.send(payload);
            }
        };

        const replyError = async (content) => {
            const payload = { content, ephemeral: true };
            if (isSlash) {
                if (interaction.replied || interaction.deferred) return interaction.editReply(payload);
                return interaction.reply(payload);
            } else {
                return message.reply(payload);
            }
        };

        if (!client.activePlayers) client.activePlayers = new Set();

        if (client.activePlayers.has(sender.id)) {
            return replyError("🚫 **لا يمكنك التحويل الآن!** أنت مشغول في لعبة أو عملية أخرى.");
        }

        if (!receiver || isNaN(amount) || amount <= 0) {
            return replyError(`طريقة التحويل الصحيحة:\n- \`تحويل <@user> <المبلغ>\``);
        }

        if (receiver.id === sender.id) return replyError("❌ لا يمكنك التحويل لنفسك!");
        if (receiver.user.bot) return replyError("❌ لا يمكنك التحويل للبوتات!");

        try {
            await db.query(`ALTER TABLE levels ADD COLUMN IF NOT EXISTS "lastTransferDate" TEXT DEFAULT ''`);
            await db.query(`ALTER TABLE levels ADD COLUMN IF NOT EXISTS "dailyTransferCount" BIGINT DEFAULT 0`);
        } catch (e) {}

        let senderData = await client.getLevel(sender.id, guild.id);
        if (!senderData) senderData = { ...client.defaultData, user: sender.id, guild: guild.id };

        // 🔥 فحص القروض 🔥
        try {
            let loanRes;
            try {
                loanRes = await db.query(`SELECT "remainingAmount" FROM user_loans WHERE "userID" = $1 AND "guildID" = $2`, [sender.id, guild.id]);
            } catch (e) {
                loanRes = await db.query(`SELECT remainingamount FROM user_loans WHERE userid = $1 AND guildid = $2`, [sender.id, guild.id]).catch(()=>({rows:[]}));
            }
            const loanData = loanRes?.rows[0];
            if (loanData && Number(loanData.remainingAmount || loanData.remainingamount) > 0) {
                return replyError(`❌ **عذراً!** لا يمكنك التحويل وعليك قرض بقيمة **${Number(loanData.remainingAmount || loanData.remainingamount).toLocaleString()}** مورا.`);
            }
        } catch (e) {}

        const now = Date.now();
        const timeLeft = (Number(senderData.lastTransfer || senderData.lasttransfer) || 0) + COOLDOWN_MS - now;
        if (timeLeft > 0) {
            const minutes = Math.floor(timeLeft / 60000);
            const seconds = Math.floor((timeLeft % 60000) / 1000);
            return replyError(`🕐 يرجى الانتظار **${minutes} دقيقة و ${seconds} ثانية** لعمل تحويل جديد.`);
        }

        // 🔥 نظام سحب الرصيد الذكي (كاش + بنك) 🔥
        let pMora = Number(senderData.mora) || 0;
        let pBank = Number(senderData.bank) || 0;

        if (pMora + pBank < amount) {
            return replyError(`❌ ليس لديك مورا كافية! (رصيدك الإجمالي بالكاش والبنك: **${(pMora + pBank).toLocaleString()}** فقط)`);
        }

        // 🔥 فحص رتبة ملك الكرم 🔥
        let isPhilanthropistKing = false;
        try {
            let settingsRes;
            try { settingsRes = await db.query(`SELECT "rolePhilanthropist" FROM settings WHERE "guild" = $1`, [guild.id]); } 
            catch (e) { settingsRes = await db.query(`SELECT rolephilanthropist FROM settings WHERE guild = $1`, [guild.id]).catch(()=>({rows:[]})); }
            const settings = settingsRes?.rows[0];
            const roleId = settings?.rolephilanthropist || settings?.rolePhilanthropist;
            if (roleId && senderMember.roles.cache.has(roleId)) isPhilanthropistKing = true;
        } catch(e) {}

        // حساب الضرائب
        const saudiDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
        let tempDailyCount = Number(senderData.dailyTransferCount || senderData.dailytransfercount) || 0;
        if (senderData.lastTransferDate !== saudiDate && senderData.lasttransferdate !== saudiDate) tempDailyCount = 0;
        
        let displayTaxRate = (tempDailyCount === 0 || isPhilanthropistKing) ? 0 : BASE_TAX_RATE;
        const displayTaxAmount = Math.floor(amount * displayTaxRate);
        const displayAmountReceived = amount - displayTaxAmount;

        // تنفيذ الخصم الذكي
        if (pMora >= amount) {
            pMora -= amount; // خصم من الكاش فقط
        } else {
            const remaining = amount - pMora;
            pMora = 0; // تصفير الكاش
            pBank -= remaining; // سحب الباقي من البنك
        }

        // حماية البوت أثناء تنفيذ التحويل
        client.activePlayers.add(sender.id);

        try {
            await db.query('BEGIN'); // بدء المعاملة لضمان أمان النقل

            // تحديث بيانات المرسل
            senderData.mora = String(pMora);
            senderData.bank = String(pBank);
            senderData.dailyTransferCount = tempDailyCount + 1;
            senderData.lastTransferDate = saudiDate;
            senderData.lastTransfer = now;

            try {
                await db.query(`UPDATE levels SET "mora" = $1, "bank" = $2, "dailyTransferCount" = $3, "lastTransferDate" = $4, "lastTransfer" = $5 WHERE "user" = $6 AND "guild" = $7`, 
                    [pMora, pBank, senderData.dailyTransferCount, saudiDate, now, sender.id, guild.id]);
            } catch(e) {
                await db.query(`UPDATE levels SET mora = $1, bank = $2, dailytransfercount = $3, lasttransferdate = $4, lasttransfer = $5 WHERE userid = $6 AND guildid = $7`, 
                    [pMora, pBank, senderData.dailyTransferCount, saudiDate, now, sender.id, guild.id]).catch(()=>{});
            }
            if (client.setLevel) await client.setLevel(senderData);

            // تحديث بيانات المستلم
            let receiverData = await client.getLevel(receiver.id, guild.id);
            if (!receiverData) receiverData = { ...client.defaultData, user: receiver.id, guild: guild.id };
            
            let rMora = (Number(receiverData.mora) || 0) + displayAmountReceived;
            receiverData.mora = String(rMora);

            try {
                await db.query(`UPDATE levels SET "mora" = $1 WHERE "user" = $2 AND "guild" = $3`, [rMora, receiver.id, guild.id]);
            } catch(e) {
                await db.query(`UPDATE levels SET mora = $1 WHERE userid = $2 AND guildid = $3`, [rMora, receiver.id, guild.id]).catch(()=>{});
            }
            if (client.setLevel) await client.setLevel(receiverData);

            await db.query('COMMIT'); // تأكيد النقل
        } catch (e) {
            await db.query('ROLLBACK'); // إرجاع كل شيء إذا فشل لكي لا تضيع الأموال
            client.activePlayers.delete(sender.id);
            return replyError("❌ **فشلت العملية:** حدث خطأ تقني أثناء التحويل.");
        }

        client.activePlayers.delete(sender.id);

        if (updateGuildStat) {
            updateGuildStat(client, guild.id, sender.id, 'mora_donated', amount);
        }

        let footerText = "💡 استهلكت تحويلك المجاني اليوم.";
        if (isPhilanthropistKing) {
            footerText = "👑 إعفاء ملك الكرم: تحويل مجاني بلا رسوم!";
        } else if (tempDailyCount === 0) {
            footerText = "💡 هذا هو تحويلك اليومي المجاني!";
        }

        const successEmbed = new EmbedBuilder()
            .setColor("Green")
            .setTitle('✅ تـم التـحويـل بنجـاح')
            .setDescription([
                `**المرسل:** ${sender.username}`,
                `**المستلم:** ${receiver.user.username}`,
                `\n**المبلغ المُرسل:** ${amount.toLocaleString()} <:mora:1435647151349698621>`,
                `**الضريبة (${displayTaxRate === 0 ? '0%' : '3%'}):** ${displayTaxAmount.toLocaleString()} <:mora:1435647151349698621>`,
                `**المبلغ المستلم:** ${displayAmountReceived.toLocaleString()} <:mora:1435647151349698621>`
            ].join('\n'))
            .setFooter({ text: footerText })
            .setImage('https://i.postimg.cc/vHhJTgyx/download-3.jpg')
            .setTimestamp();

        await reply({ content: `<@${receiver.id}>`, embeds: [successEmbed] });
    }
};
