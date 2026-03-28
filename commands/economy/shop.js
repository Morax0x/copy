const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, MessageFlags } = require("discord.js");
const shopItems = require('../../json/shop-items.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('متجر')
        .setDescription('تصفح متجر الإمبراطورية الشامل'),

    name: 'shop',
    aliases: ['متجر'],
    category: "Economy",

    async execute(interactionOrMessage) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, client, author, guild;

        if (isSlash) {
            interaction = interactionOrMessage;
            client = interaction.client;
            author = interaction.user;
            guild = interaction.guild;
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        } else {
            message = interactionOrMessage;
            client = message.client;
            author = message.author;
            guild = message.guild;
        }

        const db = client.sql;
        
        let userData = await client.getLevel(author.id, guild.id);
        if (!userData) {
            let dbRes = await db.query(`SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [author.id, guild.id]).catch(()=>({rows:[]}));
            userData = dbRes.rows[0] || { mora: 0, bank: 0 };
        }

        let generateShopImage;
        try { 
            generateShopImage = require('../../generators/shop-generator.js').generateShopImage; 
        } catch(e) {}

        if (!generateShopImage) {
            const msg = { content: "❌ نظام الرسم غير متوفر حالياً.", flags: MessageFlags.Ephemeral };
            if (isSlash) return interaction.editReply(msg);
            else return message.reply(msg);
        }

        const imageBuffer = await generateShopImage(author, userData, shopItems);

        const options = shopItems.map(item => ({
            label: item.name,
            description: `السعر: ${item.price} | ${item.description.substring(0, 50)}`,
            value: `buy_item_${item.id}`,
            emoji: item.emoji || '📦'
        }));

        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('shop_buy_select')
                .setPlaceholder('🛒 شراء (اختر العنصر من هنا)...')
                .addOptions(options)
        );

        const replyData = {
            content: `**مرحباً بك في متجر الإمبراطورية الشامل** يا <@${author.id}>`,
            files: [{ attachment: imageBuffer, name: 'empire_shop_all.png' }],
            components: [row]
        };

        if (isSlash) {
            await interaction.editReply(replyData);
        } else {
            replyData.flags = MessageFlags.Ephemeral;
            await message.reply(replyData);
        }
    }
};
