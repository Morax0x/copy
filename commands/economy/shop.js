const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    PermissionsBitField, 
    MessageFlags, 
    SlashCommandBuilder, 
    Colors 
} = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('متجر')
        .setDescription('يعرض المتجر'),

    name: 'shop',
    aliases: ['متجر', 'setup-shop'],
    category: "Economy",
    description: 'يقوم بنشر رسالة المتجر التفاعلية (للإدارة) أو يوجهك للمتجر.',

    async execute(interactionOrMessage, args) {

        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, member, channel;

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            member = interaction.member;
            channel = interaction.channel;
            await interaction.deferReply({ ephemeral: true });
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            member = message.member;
            channel = message.channel;
        }

        const replyEphemeral = async (payload) => {
            if (typeof payload === 'string') payload = { content: payload };
            payload.ephemeral = true;

            if (isSlash) {
                return interaction.editReply(payload);
            } else {
                payload.flags = MessageFlags.Ephemeral;
                return message.reply(payload);
            }
        };

        const db = client.sql;

        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            const guildId = guild.id;
            try {
                await db.query("INSERT INTO settings (guild) VALUES ($1) ON CONFLICT (guild) DO NOTHING", [guildId]);
                const settingsRes = await db.query("SELECT shopChannelID FROM settings WHERE guild = $1", [guildId]);
                const settings = settingsRes.rows[0];
                const shopId = settings?.shopchannelid || settings?.shopChannelID;

                if (!settings || !shopId) {
                    return replyEphemeral({
                        content: `❌ لم يقم أي إداري بإعداد المتجر في هذا السيرفر بعد.`
                    });
                }

                return replyEphemeral({
                    content: `✥ تـوجـه الى قنـاة المـتجـر: <#${shopId}>`
                });
            } catch(e) {
                console.error(e);
                return replyEphemeral({ content: `❌ حدث خطأ أثناء التحقق من المتجر.` });
            }
        }

        const buttonRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('shop_open_menu') 
                .setLabel('تصفح المتجر')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🛒')
        );

        const descriptionText = `
✥ في هذا المتجر العريق، يمكنك جمع المـورا من الكازينو واستخدامها لاستبدالها بـ جوائز لا تتوفر إلا في ساحات الإمبراطورية<a:HypedDance:1435572391190204447>! 

✬ اشترِ مستويات إضافية لتتقدم في السيرفر وتزداد مكانتك بين النخبة , استأجر حارس شخصي لحماية ممتلكاتك احصل على دروع الستريك <:Shield:1437804676224516146> استمتع بـ تعزيز خبرة لتزيد مستواك ونقاط الاتش بي <a:levelup:1437805366048985290> احصل على رتب خاصة تمنحك الهيبة والتألق بين الأعضاء، واجعل اسمك يسطع في كل ركن من أركان الإمبراطورية <a:JaFaster:1435572430042042409>

✦ كل ما ترغب به متاح في متجر الإمبراطورية، فقط اجمع، استبدل، وتألق <:mora:1435647151349698621>!

✦ لمعرفة طريقة اللعب وجمع المورا توجه الكازينو واكتب \`اوامر\` <:mora:1435647151349698621>
        `;

        const mainEmbed = new EmbedBuilder()
            .setTitle('متجر الامبراطورية <:mora:1435647151349698621>')
            .setURL('https://top.gg/discord/servers/732581242885705728/vote')
            .setDescription(descriptionText)
            .setColor('#9A6AAD') 
            .setImage('https://i.postimg.cc/kMwWDMM0/shop.jpg');

        await channel.send({ embeds: [mainEmbed], components: [buttonRow] });

        try {
            const guildId = guild.id;
            const channelId = channel.id;

            await db.query("INSERT INTO settings (guild) VALUES ($1) ON CONFLICT (guild) DO NOTHING", [guildId]);
            await db.query("UPDATE settings SET shopChannelID = $1 WHERE guild = $2", [channelId, guildId]);

            if (isSlash) {
                await interaction.editReply({ content: '✅ تم نشر لوحة المتجر وحفظها كمتجر رسمي لهذا السيرفر.' });
            } else {
                await message.reply({ content: '✅ تم نشر لوحة المتجر وحفظها كمتجر رسمي لهذا السيرفر.'});
            }

        } catch (err) {
            console.error("خطأ في حفظ قناة المتجر:", err);
            await replyEphemeral({ content: '⚠️ تم نشر المتجر، ولكن حدث خطأ أثناء حفظه كمتجر رسمي للسيرفر.' });
        }
    }
};
