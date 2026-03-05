const { EmbedBuilder, Colors } = require("discord.js");

module.exports = {
    name: 'relation',
    description: 'كشف صلة القرابة الدقيقة والمفصلة بينك وبين عضو آخر',
    aliases: ['قرابة', 'صلة', 'rel', 'kinship'],
    category: 'Family',

    async execute(message, args) {
        const client = message.client;
        const db = client.sql;
        const guildId = message.guild.id;
        const userA = message.author; 
        
        const userBMember = message.mentions.members.first() || message.guild.members.cache.get(args[0]);
        if (!userBMember) {
            const msg = await message.reply("❌ **منشن الشخص عشان أفحص شجرة العائلة وأطلع لك القرابة!**");
            setTimeout(() => msg.delete().catch(() => {}), 5000);
            return;
        }

        const userB = userBMember.user; 

        if (userA.id === userB.id) {
            const msg = await message.reply("🪞 **أنت هو أنت!**");
            setTimeout(() => msg.delete().catch(() => {}), 5000);
            return;
        }

        let familyConfig = null;
        try {
            const configRes = await db.query("SELECT maleRole, femaleRole FROM family_config WHERE guildID = $1", [guildId]);
            familyConfig = configRes.rows[0];
        } catch(e) {}
        
        const getGenderedTitle = (member, type) => {
            const checkRole = (rolesData) => {
                if (!rolesData) return false;
                try {
                    const roleIds = JSON.parse(rolesData);
                    if (Array.isArray(roleIds)) return roleIds.some(id => member.roles.cache.has(id));
                } catch {
                    return member.roles.cache.has(rolesData);
                }
                return false;
            };

            const isMale = familyConfig && checkRole(familyConfig.malerole || familyConfig.maleRole);
            const isFemale = familyConfig && checkRole(familyConfig.femalerole || familyConfig.femaleRole);
            
            const titles = {
                spouse: isMale ? "الزوج" : (isFemale ? "الزوجة" : "شريك حياة"),
                parent: isMale ? "الأب" : (isFemale ? "الأم" : "الوالد"),
                child: isMale ? "الابن" : (isFemale ? "الابنة" : "الابن"),
                sibling: isMale ? "الأخ" : (isFemale ? "الأخت" : "الشقيق"),
                grandparent: isMale ? "الجد" : (isFemale ? "الجدة" : "الجد"),
                great_grandparent: isMale ? "الجد الأكبر" : (isFemale ? "الجدة الكبرى" : "الجد الأكبر"),
                grandchild: isMale ? "الحفيد" : (isFemale ? "الحفيدة" : "الحفيد"),
                great_grandchild: isMale ? "ابن الحفيد" : (isFemale ? "ابنة الحفيد" : "سليل"),
                uncle: isMale ? "العم/الخال" : (isFemale ? "العمة/الخالة" : "قريب من الدرجة الثانية"),
                nephew: isMale ? "ابن الأخ/الأخت" : (isFemale ? "ابنة الأخ/الأخت" : "ابن الشقيق"),
                cousin: isMale ? "ابن العم/الخال" : (isFemale ? "ابنة العم/الخال" : "قريب"),
                parent_in_law: isMale ? "حمو (أبو الزوج/ة)" : (isFemale ? "حماة (أم الزوج/ة)" : "من الأصهار"),
                child_in_law: isMale ? "زوج الابنة (الصهر)" : (isFemale ? "زوجة الابن (الكنة)" : "زوج الابن/ة"),
                sibling_in_law: isMale ? "أخ الزوج/ة (أو زوج الأخت)" : (isFemale ? "أخت الزوج/ة (أو زوجة الأخ)" : "صهر"),
                step_parent: isMale ? "زوج الأم" : (isFemale ? "زوجة الأب" : "زوج الوالد"),
                step_child: isMale ? "(ابن الزوج/ة)" : (isFemale ? "ابنة الزوج/ة)" : "ربيب"),
                step_sibling: isMale ? "أخ غير شقيق" : (isFemale ? "أخت غير شقيقة" : "أخ غير شقيق"),
            };

            return titles[type] || "قريب";
        };

        const getParents = async (id) => {
            const res = await db.query("SELECT parentID FROM children WHERE childID = $1 AND guildID = $2", [id, guildId]);
            return res.rows.map(r => r.parentid || r.parentID);
        };
        const getChildren = async (id) => {
            const res = await db.query("SELECT childID FROM children WHERE parentID = $1 AND guildID = $2", [id, guildId]);
            return res.rows.map(r => r.childid || r.childID);
        };
        const getPartner = async (id) => {
            const res = await db.query("SELECT partnerID FROM marriages WHERE userID = $1 AND guildID = $2 LIMIT 1", [id, guildId]);
            const m = res.rows[0];
            return m ? (m.partnerid || m.partnerID) : null;
        };

        let relName = "غـربـاء 🚶‍♂️";
        let relEmoji = "❓";
        let relColor = Colors.Grey;
        let relationFound = false;

        const partnerA = await getPartner(userA.id);
        if (partnerA === userB.id) {
            relName = getGenderedTitle(userBMember, 'spouse');
            relEmoji = "💍";
            relColor = Colors.LuminousVividPink;
            relationFound = true;
        }

        if (!relationFound) {
            const parentsA = await getParents(userA.id);
            const childrenA = await getChildren(userA.id);

            if (parentsA.includes(userB.id)) {
                relName = getGenderedTitle(userBMember, 'parent');
                relEmoji = "👑";
                relColor = Colors.Gold;
                relationFound = true;
            }
            else if (childrenA.includes(userB.id)) {
                relName = getGenderedTitle(userBMember, 'child');
                relEmoji = "🍼";
                relColor = Colors.Blue;
                relationFound = true;
            }
        }

        if (!relationFound) {
            const parentsA = await getParents(userA.id);
            const parentsB = await getParents(userB.id);
            const areSiblings = parentsA.some(pid => parentsB.includes(pid));
            
            if (areSiblings) {
                relName = getGenderedTitle(userBMember, 'sibling');
                relEmoji = "🤝";
                relColor = Colors.Green;
                relationFound = true;
            }
        }

        if (!relationFound) {
            const parentsA = await getParents(userA.id);
            const childrenA = await getChildren(userA.id);

            let grandParentsA = [];
            for (const pid of parentsA) {
                const gps = await getParents(pid);
                grandParentsA.push(...gps);
            }
            
            if (grandParentsA.includes(userB.id)) {
                relName = getGenderedTitle(userBMember, 'grandparent');
                relEmoji = "👴";
                relColor = Colors.Grey;
                relationFound = true;
            }
            
            if (!relationFound) {
                let grandChildrenA = [];
                for (const cid of childrenA) {
                    const gcs = await getChildren(cid);
                    grandChildrenA.push(...gcs);
                }
                
                if (grandChildrenA.includes(userB.id)) {
                    relName = getGenderedTitle(userBMember, 'grandchild');
                    relEmoji = "🧸";
                    relColor = Colors.Aqua;
                    relationFound = true;
                }
            }

            if (!relationFound) {
                let greatGrandParentsA = [];
                for (const gpid of grandParentsA) {
                    const ggps = await getParents(gpid);
                    greatGrandParentsA.push(...ggps);
                }
                if (greatGrandParentsA.includes(userB.id)) {
                    relName = getGenderedTitle(userBMember, 'great_grandparent');
                    relEmoji = "📜";
                    relationFound = true;
                }
            }
        }

        if (!relationFound) {
            const parentsA = await getParents(userA.id);
            const parentsB = await getParents(userB.id);

            let unclesA = [];
            for (const pid of parentsA) {
                const grandParents = await getParents(pid);
                for (const gp of grandParents) {
                    const uncles = (await getChildren(gp)).filter(u => u !== pid);
                    unclesA.push(...uncles);
                }
            }

            if (unclesA.includes(userB.id)) {
                relName = getGenderedTitle(userBMember, 'uncle');
                relEmoji = "🎩";
                relColor = Colors.Purple;
                relationFound = true;
            }

            if (!relationFound) {
                let mySiblings = [];
                for (const pid of parentsA) {
                    const sibs = (await getChildren(pid)).filter(s => s !== userA.id);
                    mySiblings.push(...sibs);
                }

                if (parentsB.some(pb => mySiblings.includes(pb))) {
                    relName = getGenderedTitle(userBMember, 'nephew');
                    relEmoji = "🐣";
                    relColor = Colors.LightGrey;
                    relationFound = true;
                }
            }

            if (!relationFound) {
                let parentsASiblings = [];
                for (const pa of parentsA) {
                    const grandP = await getParents(pa);
                    for (const gp of grandP) {
                        const sibs = (await getChildren(gp)).filter(s => s !== pa);
                        parentsASiblings.push(...sibs);
                    }
                }

                if (parentsB.some(pb => parentsASiblings.includes(pb))) {
                    relName = getGenderedTitle(userBMember, 'cousin');
                    relEmoji = "👥";
                    relColor = Colors.Teal;
                    relationFound = true;
                }
            }
        }

        if (!relationFound) {
            const partnerA = await getPartner(userA.id);
            const parentsPartnerA = partnerA ? await getParents(partnerA) : [];

            if (partnerA && parentsPartnerA.includes(userB.id)) {
                relName = getGenderedTitle(userBMember, 'parent_in_law');
                relEmoji = "🎎";
                relColor = Colors.DarkOrange;
                relationFound = true;
            }

            if (!relationFound) {
                const childrenA = await getChildren(userA.id);
                const partnerB = await getPartner(userB.id);
                if (partnerB && childrenA.includes(partnerB)) {
                    relName = getGenderedTitle(userBMember, 'child_in_law');
                    relEmoji = "🤝";
                    relColor = Colors.Yellow;
                    relationFound = true;
                }
            }

            if (!relationFound && partnerA) {
                const parentsPart = await getParents(partnerA);
                let partnerSiblings = [];
                for (const pp of parentsPart) {
                    const sibs = (await getChildren(pp)).filter(s => s !== partnerA);
                    partnerSiblings.push(...sibs);
                }
                if (partnerSiblings.includes(userB.id)) {
                    relName = getGenderedTitle(userBMember, 'sibling_in_law');
                    relEmoji = "🎋";
                    relationFound = true;
                }
            }

            if (!relationFound) {
                const parentsA = await getParents(userA.id);
                let mySiblings = [];
                for (const p of parentsA) {
                    const sibs = (await getChildren(p)).filter(s => s !== userA.id);
                    mySiblings.push(...sibs);
                }
                const partnerB = await getPartner(userB.id);
                if (partnerB && mySiblings.includes(partnerB)) {
                    relName = getGenderedTitle(userBMember, 'sibling_in_law');
                    relEmoji = "🎋";
                    relationFound = true;
                }
            }
        }

        if (!relationFound) {
            const parentsA = await getParents(userA.id);
            for (const pid of parentsA) {
                const pPartner = await getPartner(pid);
                if (pPartner === userB.id) {
                    relName = getGenderedTitle(userBMember, 'step_parent');
                    relEmoji = "🧣";
                    relColor = Colors.Orange;
                    relationFound = true;
                    break;
                }
            }

            if (!relationFound) {
                const partnerA = await getPartner(userA.id);
                if (partnerA) {
                    const partnerChildren = await getChildren(partnerA);
                    if (partnerChildren.includes(userB.id)) {
                        relName = getGenderedTitle(userBMember, 'step_child');
                        relEmoji = "🐣";
                        relationFound = true;
                    }
                }
            }
        }

        const embed = new EmbedBuilder()
            .setColor(relColor)
            .setAuthor({ name: 'نظام فحص الأنساب', iconURL: client.user.displayAvatarURL() })
            .setTitle(`🔍 نتيجة فحص صلة القرابة`)
            .setDescription(`
> **بين:** ${userA}
> **و:** ${userBMember}

✨ **النتيجة:**
# ${relEmoji} ${relName}
            `)
            .setThumbnail(userBMember.displayAvatarURL({ dynamic: true }))
            .setFooter({ text: 'سجل العائلة الإمبراطوري', iconURL: message.guild.iconURL() })
            .setTimestamp();

        const msg = await message.reply({ embeds: [embed] });
        
        setTimeout(() => msg.delete().catch(() => {}), 15000);
    }
};
