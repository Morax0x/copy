const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const path = require('path');

const { manageTickets, manageCampfires } = require(path.join(process.cwd(), 'handlers/dungeon/utils.js'));

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tickets')
        .setDescription('عرض عدد تذاكر وخيم الدانجون المتوفرة')
        .addUserOption(option => 
            option.setName('user')
                .setDescription('الشخص الذي تريد رؤية تذاكره')
                .setRequired(false)
        ),

    name: 'tickets',
    aliases: ['ticket', 'تذاكري', 'تذاكر', 'تذكرة', 'خيمة', 'خيم', 'مخيمات', 'camps', 'campfires'],
    category: "Economy", 
    description: 'عرض عدد تذاكر الدانجون والخيم المتوفرة وموعد التجديد.',
    usage: '-tickets [@user]',

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, user, targetMember;

        if (isSlash) {
            interaction = interactionOrMessage;
            user = interaction.user;
            targetMember = interaction.options.getMember('user') || interaction.member;
        } else {
            message = interactionOrMessage;
            user = message.author;
            targetMember = message.mentions.members.first() || message.member;
        }

        const client = interactionOrMessage.client;
        const db = client.sql; 

        if (!db) {
            console.error("Error: SQL Database is not attached to Client.");
            return;
        }

        const targetUser = targetMember.user;

        const ticketData = await manageTickets(targetUser.id, interactionOrMessage.guild.id, db, 'check', targetMember);

        const campData = await manageCampfires(targetUser.id, interactionOrMessage.guild.id, db, 'check', targetMember);

        const now = new Date();
        const nextReset = new Date(now);
        nextReset.setUTCHours(21, 0, 0, 0); 

        if (now > nextReset) {
            nextReset.setDate(nextReset.getDate() + 1);
        }

        const timestamp = Math.floor(nextReset.getTime() / 1000);

        const titleText = targetUser.id === user.id ? 'عـدد تـذاكـرك' : `عـدد تـذاكـر ${targetUser.username}`;

        const embed = new EmbedBuilder()
            .setTitle('✥ تـذاكـر وخيـم الدانـجـون')
            .setColor('#E8271C') 
            .setThumbnail('https://i.postimg.cc/0jksK7N9/duti.png')
            .setDescription(
                `✶ ${titleText} ايـها المحـارب هـو **(${ticketData.tickets}/${ticketData.max})**\n\n` +
                `✶ كلـمـا ارتقـيـت بالامبراطـوريـة زادت تـذاكـرك 🎫\n\n` +
                `✶ عـدد الخيـم هو: (${campData.count}/${campData.max})⛺\n\n` + 
                `✶ تـتجـدد التذاكـر والخيم:\n <t:${timestamp}:R>`
            )
            .setFooter({ text: targetUser.username, iconURL: targetUser.displayAvatarURL() });

        if (isSlash) {
            await interaction.reply({ embeds: [embed] });
        } else {
            await message.channel.send({ embeds: [embed] });
        }
    },
};
