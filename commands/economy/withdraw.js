const { EmbedBuilder, Colors, SlashCommandBuilder } = require("discord.js");

const EMOJI_MORA = '<:mora:1435647151349698621>';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('سحب')
        .setDescription('سحب المورا من البنك إلى رصيدك (الكاش).')
        .addStringOption(option =>
            option.setName('المبلغ')
            .setDescription('المبلغ الذي تريد سحبه أو "all" / "الكل"')
            .setRequired(true)),

    name: 'withdraw',
    aliases: ['سحب', 'with'],
    category: "Economy",
    cooldown: 5, 
    description: 'سحب المورا من البنك إلى رصيدك الكاش',

    async execute(interactionOrMessage, args) {

        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, user;
        let amountArg;

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            user = interaction.user;
            amountArg = interaction.options.getString('المبلغ');
            await interaction.deferReply();
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            user = message.author;
            amountArg = args[0];
        }

        const reply = async (payload) => {
            if (isSlash) {
                return interaction.editReply(payload);
            } else {
                return message.channel.send(payload);
            }
        };

        const replyError = async (content) => {
            const payload = { content, ephemeral: true };
            if (isSlash) {
                return interaction.editReply(payload);
            } else {
                return message.reply(payload);
            }
        };

        const guildId = guild.id;
        const db = client.sql; 

        let data = await client.getLevel(user.id, guildId);
        if (!data) {
             data = { ...client.defaultData, user: user.id, guild: guildId };
             await client.setLevel(data); 
        }

        const userBank = Number(data.bank) || 0;
        let amountToWithdraw;

        if (!amountArg || ['all', 'الكل'].includes(amountArg.toLowerCase())) {
            amountToWithdraw = userBank;
        } else {
            amountToWithdraw = parseInt(amountArg.replace(/,/g, ''));
            if (isNaN(amountToWithdraw)) {
                 return replyError(`الاستخدام: \`/سحب <المبلغ | الكل>\` (المبلغ الذي أدخلته ليس رقماً).`);
            }
        }

        if (amountToWithdraw <= 0) {
            return replyError(`ليس لديك أي مورا في البنك لسحبها!`);
        }

        if (userBank < amountToWithdraw) {
            return replyError(` <:stop:1436337453098340442> ليس لديك هذا المبلغ في البنك لسحبه! (رصيدك البنكي: ${userBank.toLocaleString()} ${EMOJI_MORA}) `);
        }

        try {
            const query = `
                UPDATE levels 
                SET bank = bank - $1, 
                    mora = mora + $2 
                WHERE "user" = $3 AND guild = $4 AND bank >= $5
            `;

            const result = await db.query(query, [
                amountToWithdraw, 
                amountToWithdraw, 
                user.id, 
                guildId, 
                amountToWithdraw 
            ]);

            if (result.rowCount === 0) {
                return replyError(`❌ فشلت العملية: يبدو أن رصيدك تغير أثناء المحاولة أو أنه غير كافٍ.`);
            }

            const newData = await client.getLevel(user.id, guildId);
            const finalBank = Number(newData.bank) || 0;
            const finalMora = Number(newData.mora) || 0;

            const embed = new EmbedBuilder()
                .setColor("Random")
                .setTitle('✶ تـمت عمليـة السحـب !')
                .setThumbnail(user.displayAvatarURL())
                .setDescription(
                    `❖ تـم سـحـب: **${amountToWithdraw.toLocaleString()}** ${EMOJI_MORA}\n` +
                    `❖ رصـيد البـنك: **${finalBank.toLocaleString()}** ${EMOJI_MORA}\n` +
                    `❖ رصـيـدك الكـاش: **${finalMora.toLocaleString()}** ${EMOJI_MORA}`
                );

            await reply({ embeds: [embed] });

        } catch (error) {
            console.error("Withdraw Error:", error);
            return replyError("حدث خطأ غير متوقع أثناء عملية السحب.");
        }
    }
};
