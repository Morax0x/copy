const { EmbedBuilder, SlashCommandBuilder } = require("discord.js");
const marketConfig = require('../../json/market-items.json'); 

const EMOJI_MORA = '<:mora:1435647151349698621>'; 

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ممتلكات')
        .setDescription('يعرض الأسهم والعقارات التي تملكها.')
        .addUserOption(option => 
            option.setName('المستخدم')
            .setDescription('المستخدم الذي تريد عرض محفظته')
            .setRequired(false)),

    name: 'portfolio',
    aliases: ['محفظتي', 'استثماراتي', 'ممتلكات'],
    category: "Economy",
    description: 'يعرض الأسهم والعقارات التي تملكها.',

    async execute(interactionOrMessage, args) {

        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client;
        let user;

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            user = interaction.options.getMember('المستخدم') || interaction.member;
            await interaction.deferReply();
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            user = message.mentions.members.first() || message.guild.members.cache.get(args[0]) || message.member;
        }

        const reply = async (payload) => {
            if (isSlash) {
                return interaction.editReply(payload);
            } else {
                return message.channel.send(payload);
            }
        };

        const db = client.sql;

        let portfolio = [];
        try {
            const res = await db.query("SELECT * FROM user_portfolio WHERE guildID = $1 AND userID = $2", [guild.id, user.id]);
            portfolio = res.rows;
        } catch(e) {}
        
        const market = new Map(marketConfig.map(item => [item.id, item]));

        const embed = new EmbedBuilder()
            .setTitle(`💼 اصـول الاستثمـارات لـ ${user.displayName}`)
            .setColor("Gold")
            .setThumbnail(user.displayAvatarURL())
            .setImage('https://media.discordapp.net/attachments/1394280285289320550/1432409477272965190/line.png?ex=690eca88&is=690d7908&hm=b21b91d8e7b66da4c28a29dd513bd1104c76ab6c875f23cd9405daf3ce48c050&=&format=webp&quality=lossless');

        let validItems = [];
        let totalValue = 0;

        for (const item of portfolio) {
            const itemID = item.itemid || item.itemID;
            const itemQty = Number(item.quantity) || 0;
            const itemPurchasePrice = Number(item.purchaseprice || item.purchasePrice) || 0;

            const marketItem = market.get(itemID);
            
            if (!marketItem) continue;

            let currentPrice = marketItem.price;
            try {
                const dbItemRes = await db.query("SELECT currentPrice FROM market_items WHERE id = $1", [itemID]);
                const dbItem = dbItemRes.rows[0];
                if (dbItem && dbItem.currentprice) currentPrice = Number(dbItem.currentprice);
                else if (dbItem && dbItem.currentPrice) currentPrice = Number(dbItem.currentPrice);
            } catch (e) {}

            const itemTotalValue = currentPrice * itemQty;
            totalValue += itemTotalValue;

            let purchasePrice = itemPurchasePrice;

            validItems.push({
                name: marketItem.name,
                quantity: itemQty,
                value: itemTotalValue,
                price: currentPrice,
                buyPrice: purchasePrice 
            });
        }

        if (validItems.length === 0) {
            embed.setDescription("✥ محفظتك الاستثمارية فارغة حالياً. استخدم `/سوق` لشراء الأصول.");
        } else {
            let descriptionLines = []; 
            
            for (const vItem of validItems) {
                descriptionLines.push(`**✶ ${vItem.name} العدد: ${vItem.quantity.toLocaleString()}**`);
                descriptionLines.push(`✬ قيمـة الاصـل: ${vItem.value.toLocaleString()} ${EMOJI_MORA}`);
                descriptionLines.push(`✦ سعـر الاصـل الحالي: ${vItem.price.toLocaleString()} ${EMOJI_MORA}`);
                
                if (vItem.buyPrice > 0) {
                    descriptionLines.push(`✦ سعـر الشـراء : ${vItem.buyPrice.toLocaleString()} ${EMOJI_MORA}`);
                }
                
                descriptionLines.push(`\u200B`); 
            }

            embed.setDescription(
                `✥ قيمة الاصول الكلية: **${totalValue.toLocaleString()}** ${EMOJI_MORA}\n\n` + 
                descriptionLines.join('\n')
            );
        }

        await reply({ embeds: [embed] });
    }
};
