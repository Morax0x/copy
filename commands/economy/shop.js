const { 
    SlashCommandBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    MessageFlags 
} = require("discord.js");
const { generateShopImage } = require('../../generators/shop-generator.js');
const shopItems = require('../../json/shop-items.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('متجر')
        .setDescription('تصفح متجر الإمبراطورية'),

    name: 'shop',
    aliases: ['متجر'],
    category: "Economy",

    async execute(interactionOrMessage, args) {
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

        let userData = await client.getLevel(author.id, guild.id);
        if (!userData) {
            userData = { mora: 0, bank: 0, level: 0 };
        }

        const generalItems = shopItems.filter(item => item.category === 'general');
        const firstItem = generalItems[0];

        const imageBuffer = await generateShopImage(author, userData, firstItem, 'السوق العام');

        const navRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('shop_nav_prev_0_general')
                .setEmoji('⬅️')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`shop_buy_${firstItem.id}`)
                .setLabel(`شراء - ${firstItem.price}`)
                .setStyle(ButtonStyle.Success)
                .setEmoji('🛒'),
            new ButtonBuilder()
                .setCustomId('shop_nav_next_0_general')
                .setEmoji('➡️')
                .setStyle(ButtonStyle.Secondary)
        );

        const categoryRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('shop_cat_general')
                .setLabel('السوق العام')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId('shop_cat_profession')
                .setLabel('المهن والحرف')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('shop_cat_premium')
                .setLabel('الخدمات المميزة')
                .setStyle(ButtonStyle.Primary)
        );

        const replyData = {
            content: `**مرحباً بك في متجر الإمبراطورية** يا <@${author.id}>`,
            files: [{ attachment: imageBuffer, name: 'empire_shop.png' }],
            components: [navRow, categoryRow],
            flags: MessageFlags.Ephemeral
        };

        if (isSlash) {
            return interaction.editReply(replyData);
        } else {
            replyData.flags = MessageFlags.Ephemeral;
            return message.reply(replyData);
        }
    }
};
