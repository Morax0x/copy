const { EmbedBuilder, Colors } = require("discord.js");

module.exports = {
    name: 'relation',
    description: 'كشف صلة القرابة بينك وبين عضو آخر',
    aliases: ['قرابة', 'صلة', 'rel'],
    category: 'Family',

    async execute(message, args) {
        const client = message.client;
        const sql = client.sql;
        const guildId = message.guild.id;
        const userA = message.author; // أنت
        
        const userBMember = message.mentions.members.first() || message.guild.members.cache.get(args[0]);
        if (!userBMember) return message.reply("❌ **منشن الشخص عشان أعلمك صلة القرابة!**");

        const userB = userBMember.user;
        if (userA.id === userB.id) return message.reply("🪞 **أنت هو أنت!**");

        // إعدادات الجنس
        const config = sql.prepare("SELECT maleRole, femaleRole FROM family_config WHERE guildID = ?").get(guildId);
        
        const getTitle = (member, type) => {
            const isMale = config && member.roles.cache.has(config.maleRole);
            const isFemale = config && member.roles.cache.has(config.femaleRole);
            
            const titles = {
                spouse: isMale ? "زوج" : (isFemale ? "زوجة" : "شريك"),
                parent: isMale ? "أب" : (isFemale ? "أم" : "ولي أمر"),
                child: isMale ? "ابن" : (isFemale ? "ابنة" : "طفل"),
                sibling: isMale ? "أخ" : (isFemale ? "أخت" : "شقيق"),
                grandparent: isMale ? "جد" : (isFemale ? "جدة" : "جد"),
                grandchild: isMale ? "حفيد" : (isFemale ? "حفيدة" : "حفيد"),
                uncle: isMale ? "عم/خال" : (isFemale ? "عمة/خالة" : "قريب"),
                nephew: isMale ? "ابن أخ/أخت" : (isFemale ? "ابنة أخ/أخت" : "ابن أخ/أخت"),
                cousin: isMale ? "ابن عم/خال" : (isFemale ? "ابنة عم/خال" : "قريب"),
                step_parent: isMale ? "زوج الأم" : (isFemale ? "زوجة الأب" : "زوج الوالد"),
                step_child: isMale ? "ربيب (ابن الزوجة)" : (isFemale ? "ربيبة (ابنة الزوج)" : "ربيب")
            };
            return titles[type];
        };

        // =========================================================
        // 🔍 محرك البحث الشامل
        // =========================================================

        let relationText = "غـربـاء 🚶‍♂️";
        let relationColor = Colors.Grey;
        let relationEmoji = "❔";

        // 1. الزواج
        const marriage = sql.prepare("SELECT * FROM marriages WHERE userID = ? AND partnerID = ? AND guildID = ?").get(userA.id, userB.id, guildId);
        if (marriage) {
            relationText = `💍 **${getTitle(userBMember, 'spouse')}**`;
            relationColor = Colors.LuminousVividPink;
            relationEmoji = "💍";
        } 
        
        // 2. الأبوة والبنوة
        else if (sql.prepare("SELECT 1 FROM children WHERE parentID = ? AND childID = ? AND guildID = ?").get(userA.id, userB.id, guildId)) {
            relationText = `🍼 **${getTitle(userBMember, 'child')}**`;
            relationColor = Colors.Blue;
            relationEmoji = "🍼";
        } 
        else if (sql.prepare("SELECT 1 FROM children WHERE parentID = ? AND childID = ? AND guildID = ?").get(userB.id, userA.id, guildId)) {
            relationText = `👑 **${getTitle(userBMember, 'parent')}**`;
            relationColor = Colors.Gold;
            relationEmoji = "👑";
        }

        else {
            // تجهيز بيانات الآباء والأجداد للتحليل العميق
            const parentsA = sql.prepare("SELECT parentID FROM children WHERE childID = ? AND guildID = ?").all(userA.id, guildId).map(r => r.parentID);
            const parentsB = sql.prepare("SELECT parentID FROM children WHERE childID = ? AND guildID = ?").all(userB.id, guildId).map(r => r.parentID);

            // 3. الأخوة
            if (parentsA.some(p => parentsB.includes(p))) {
                relationText = `🤝 **${getTitle(userBMember, 'sibling')}**`;
                relationColor = Colors.Green;
                relationEmoji = "🤝";
            }
            // 4. زوج الأم / زوجة الأب
            else {
                // هل B متزوج من أحد آباء A؟
                let isStepParent = false;
                for (const parentID of parentsA) {
                    const stepMarriage = sql.prepare("SELECT * FROM marriages WHERE userID = ? AND partnerID = ? AND guildID = ?").get(parentID, userB.id, guildId);
                    if (stepMarriage) {
                        relationText = `🧣 **${getTitle(userBMember, 'step_parent')}**`;
                        relationColor = Colors.Orange;
                        relationEmoji = "🧣";
                        isStepParent = true;
                        break;
                    }
                }

                if (!isStepParent) {
                    // 5. الأجداد والأحفاد
                    const grandParentsA = [];
                    for(const pid of parentsA) {
                        const gps = sql.prepare("SELECT parentID FROM children WHERE childID = ? AND guildID = ?").all(pid, guildId).map(r => r.parentID);
                        grandParentsA.push(...gps);
                    }

                    if (grandParentsA.includes(userB.id)) {
                        relationText = `👴 **${getTitle(userBMember, 'grandparent')}**`;
                        relationColor = Colors.DarkGrey;
                        relationEmoji = "📜";
                    } 
                    else {
                        // هل A هو جد لـ B؟
                        const grandParentsB = [];
                        for(const pid of parentsB) {
                            const gps = sql.prepare("SELECT parentID FROM children WHERE childID = ? AND guildID = ?").all(pid, guildId).map(r => r.parentID);
                            grandParentsB.push(...gps);
                        }

                        if (grandParentsB.includes(userA.id)) {
                            relationText = `👶 **${getTitle(userBMember, 'grandchild')}**`;
                            relationColor = Colors.LightGrey;
                            relationEmoji = "🦯";
                        }
                        else {
                            // 6. الأعمام والأخوال
                            // هل أحد آباء A هو أخ لـ B؟ (يعني B هو عم A)
                            let isUncle = false;
                            for (const parentID of parentsA) {
                                // آباء "والد A" (أجداد A)
                                const gpsA = sql.prepare("SELECT parentID FROM children WHERE childID = ? AND guildID = ?").all(parentID, guildId).map(r => r.parentID);
                                // آباء B
                                if (gpsA.some(gp => parentsB.includes(gp))) {
                                    isUncle = true;
                                    break;
                                }
                            }

                            if (isUncle) {
                                relationText = `🎩 **${getTitle(userBMember, 'uncle')}**`;
                                relationColor = Colors.Purple;
                                relationEmoji = "🎩";
                            } 
                            else {
                                // 7. أبناء الأخ/الأخت
                                // هل أحد آباء B هو أخ لـ A؟ (يعني B هو ابن أخ A)
                                let isNephew = false;
                                for (const parentID of parentsB) {
                                    const gpsB = sql.prepare("SELECT parentID FROM children WHERE childID = ? AND guildID = ?").all(parentID, guildId).map(r => r.parentID);
                                    if (gpsB.some(gp => parentsA.includes(gp))) {
                                        isNephew = true;
                                        break;
                                    }
                                }

                                if (isNephew) {
                                    relationText = `🐣 **${getTitle(userBMember, 'nephew')}**`;
                                    relationColor = Colors.Aqua;
                                    relationEmoji = "🐣";
                                }
                                else {
                                    // 8. أبناء العم/الخال (Cousins)
                                    // هل "أجداد A" هم نفسهم "أجداد B"؟
                                    const grandParentsB = [];
                                    for(const pid of parentsB) {
                                        const gps = sql.prepare("SELECT parentID FROM children WHERE childID = ? AND guildID = ?").all(pid, guildId).map(r => r.parentID);
                                        grandParentsB.push(...gps);
                                    }

                                    if (grandParentsA.some(gp => grandParentsB.includes(gp))) {
                                        relationText = `👥 **${getTitle(userBMember, 'cousin')}**`;
                                        relationColor = Colors.Teal;
                                        relationEmoji = "👥";
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // =========================================================
        // 📤 إرسال النتيجة
        // =========================================================

        const embed = new EmbedBuilder()
            .setColor(relationColor)
            .setTitle(`🔍 فحص صلة القرابة`)
            .setDescription(`
**الطرف الأول:** ${userA}
**الطرف الثاني:** ${userBMember}

✨ **النتيجة:** ${userBMember.displayName} يعتبر بالنسبة لك:
# ${relationEmoji} ${relationText}
            `)
            .setThumbnail(userBMember.displayAvatarURL())
            .setFooter({ text: 'نظام العائلة • الإمبراطورية' });

        message.reply({ embeds: [embed] });
    }
};
