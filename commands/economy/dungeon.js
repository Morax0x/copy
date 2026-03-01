const { SlashCommandBuilder, EmbedBuilder, Colors, MessageFlags } = require("discord.js");
const { startDungeon } = require("../../handlers/dungeon-handler.js");
const { manageTickets } = require("../../handlers/dungeon/utils.js");

const OWNER_ID = "1145327691772481577";
const COOLDOWN_MS = 1 * 60 * 60 * 1000; 

module.exports = {
    data: new SlashCommandBuilder()
        .setName('dungeon')
        .setDescription('⚔️ ادخل الدانجون وحارب الوحوش !')
        .setDMPermission(false),

    name: 'dungeon',
    aliases: ['دانجون', 'برج', 'dgn'],
    category: "Economy",
    description: "نظام الدانجون المتقدم (PvE)",

    async execute(context, args) {
        const isSlash = context.isChatInputCommand === true;
        let interaction;

        if (isSlash) {
            interaction = context;
        } else {
            interaction = {
                user: context.author,
                guild: context.guild,
                member: context.member,
                channel: context.channel,
                client: context.client,
                id: context.id,
                isChatInputCommand: false,
                reply: async (payload) => context.reply(payload),
                editReply: async (payload) => {
                    if (context.lastBotReply) return context.lastBotReply.edit(payload);
                    return context.channel.send(payload);
                },
                followUp: async (payload) => context.channel.send(payload),
                deferReply: async () => {},
                deferUpdate: async () => {},
                isButton: () => false 
            };
        }

        const { client, user, guild } = interaction;

        if (!guild) {
            return interaction.reply({ content: "🚫 **عذراً، هذا الأمر يعمل فقط داخل السيرفرات!**", flags: [MessageFlags.Ephemeral] });
        }

        try {
            client.sql.prepare("ALTER TABLE levels ADD COLUMN last_dungeon INTEGER DEFAULT 0").run();
            client.sql.prepare("ALTER TABLE levels ADD COLUMN dungeon_tickets INTEGER DEFAULT 0").run();
            client.sql.prepare("ALTER TABLE levels ADD COLUMN last_ticket_reset TEXT DEFAULT ''").run();
            client.sql.prepare("CREATE TABLE IF NOT EXISTS dungeon_saves (hostID TEXT PRIMARY KEY, guildID TEXT, floor INTEGER, timestamp INTEGER)").run();
        } catch (ignored) {}

        let isAbyssKing = false;
        try {
            const settings = client.sql.prepare("SELECT roleAbyss FROM settings WHERE guild = ?").get(guild.id);
            if (settings && settings.roleAbyss && interaction.member.roles.cache.has(settings.roleAbyss)) {
                isAbyssKing = true;
            }
        } catch (e) {}

        if (user.id !== OWNER_ID && !isAbyssKing) { 
            let userData = client.getLevel.get(user.id, guild.id);
            
            if (!userData) {
                client.setLevel.run({
                    id: `${guild.id}-${user.id}`,
                    user: user.id,
                    guild: guild.id,
                    xp: 0, level: 1, mora: 0
                });
                userData = client.getLevel.get(user.id, guild.id);
            }

            const lastRun = userData.last_dungeon || 0;
            const now = Date.now();
            const diff = now - lastRun;

            if (diff < COOLDOWN_MS) {
                const limitInfo = manageTickets(user.id, guild.id, client.sql, 'check', interaction.member);
                const readyTimestamp = Math.floor((lastRun + COOLDOWN_MS) / 1000);

                const cooldownEmbed = new EmbedBuilder()
                    .setTitle('✥ اسـتـراحـة مـحـارب !')
                    .setDescription(
                        `★ رويـدك ايهـا المحارب ارتح قليلا قبل غزو الدانجون مجددا !\n\n` +
                        `★ يمكنك غـزو الدانجـون:\n ★ <t:${readyTimestamp}:R>\n\n` + 
                        `★ لديـك **(${limitInfo.tickets}/${limitInfo.max})** تذكرة يمكنك الانضمام لفريق آخر`
                    )
                    .setThumbnail('https://i.postimg.cc/4xMWNV22/doun.png')
                    .setColor(Math.floor(Math.random() * 0xFFFFFF));

                const payload = { 
                    embeds: [cooldownEmbed], 
                    flags: [MessageFlags.Ephemeral] 
                };

                if (isSlash && (interaction.replied || interaction.deferred)) {
                    return await interaction.followUp(payload);
                }
                return await interaction.reply(payload);
            }
        }

        if (isAbyssKing && user.id !== OWNER_ID) {
            const kingPayload = { content: "👑 **سيد الهاوية! أبواب الدانجون تفتح لك بلا قيود أو انتظار.**", flags: [MessageFlags.Ephemeral] };
            if (isSlash && !interaction.replied && !interaction.deferred) {
                await interaction.reply(kingPayload).catch(()=>{});
            } else {
                await interaction.followUp(kingPayload).catch(()=>{});
            }
        }

        try {
            await startDungeon(interaction, client.sql);
        } catch (err) {
            console.error("[Dungeon Command Error]", err);
            const errMsg = { content: "❌ حدث خطأ تقني أثناء بدء الدانجون.", flags: [MessageFlags.Ephemeral] };
            
            if (interaction.replied || interaction.deferred) await interaction.followUp(errMsg);
            else await interaction.reply(errMsg);
        }
    }
};
