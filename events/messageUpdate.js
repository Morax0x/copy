const { Events } = require("discord.js");

const treeCooldowns = new Set();

module.exports = {
    name: Events.MessageUpdate,
    async execute(oldMessage, newMessage) {
        if (newMessage.partial) {
            try {
                await newMessage.fetch();
            } catch (e) {
                return; 
            }
        }
        if (!newMessage.guild) return;

        const client = newMessage.client;
        const db = client.sql; // 🔥 تم التصحيح هنا ليتوافق مع قاعدة البيانات السحابية
        
        if (!db) return; 

        try {
            // 🔥 تم تصحيح guild_id إلى guild
            const settingsResult = await db.query("SELECT treechannelid, treebotid, treemessageid FROM settings WHERE guild = $1", [newMessage.guild.id]);
            const settings = settingsResult.rows[0];
            
            if (!settings || !settings.treechannelid) return;

            if (newMessage.channel.id !== settings.treechannelid) return;
            if (!newMessage.author.bot) return;

            if (settings.treebotid && newMessage.author.id !== settings.treebotid) return;

            let fullContent = (newMessage.content || "") + " ";
            
            if (newMessage.embeds.length > 0) {
                const embed = newMessage.embeds[0];
                fullContent += (embed.description || "") + " ";
                fullContent += (embed.title || "") + " ";
                
                if (embed.fields && embed.fields.length > 0) {
                    embed.fields.forEach(field => {
                        fullContent += (field.value || "") + " ";
                    });
                }
            }

            const validPhrases = [
                "watered the tree", 
                "سقى الشجرة", 
                "Watered",
                "your tree",
                "قام بسقاية",
                "level up", 
                "tree grew",
                "has watered"
            ];

            const isTreeMessage = validPhrases.some(phrase => fullContent.toLowerCase().includes(phrase.toLowerCase()));

            if (isTreeMessage) {
                const match = fullContent.match(/<@!?(\d+)>/);
                
                if (match && match[1]) {
                    const userID = match[1];
                    
                    if (userID === client.user.id || userID === newMessage.author.id) return;

                    if (treeCooldowns.has(userID)) return;
                    
                    treeCooldowns.add(userID);
                    setTimeout(() => treeCooldowns.delete(userID), 60000); 

                    const guildID = newMessage.guild.id;

                    console.log(`[TREE TRACKER] ✅ Water detected for user: ${userID}`);

                    if (client.incrementQuestStats) {
                        await client.incrementQuestStats(userID, guildID, 'water_tree', 1).catch(()=>{});
                    } else {
                        console.error("[TREE ERROR] incrementQuestStats function missing in client!");
                    }
                }
            }
        } catch (err) {
            if (!err.message.includes('database connection is not open')) {
                console.error("[Tree Update Error]", err);
            }
        }
    },
};
