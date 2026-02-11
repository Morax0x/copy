// commands/family/relation.js

const { EmbedBuilder, Colors } = require("discord.js");

module.exports = {
    name: 'relation',
    description: 'كشف صلة القرابة الدقيقة والمفصلة بينك وبين عضو آخر',
    aliases: ['قرابة', 'صلة', 'rel', 'kinship'],
    category: 'Family',

    async execute(message, args) {
        const client = message.client;
        const sql = client.sql;
        const guildId = message.guild.id;
        const userA = message.author; // أنت (الطرف الأول)
        
        const userBMember = message.mentions.members.first() || message.guild.members.cache.get(args[0]);
        if (!userBMember) {
            const msg = await message.reply("❌ **منشن الشخص عشان أفحص شجرة العائلة وأطلع لك القرابة!**");
            setTimeout(() => msg.delete().catch(() => {}), 5000);
            return;
        }

        const userB = userBMember.user; // الطرف الثاني (الهدف)

        if (userA.id === userB.id) {
            const msg = await message.reply("🪞 **أنت هو أنت!**");
            setTimeout(() => msg.delete().catch(() => {}), 5000);
            return;
        }

        // =========================================================
        // 🛠️ أدوات النظام (Helpers)
        // =========================================================

        // 1. تحديد جنس الهدف (لتحديد المسميات: عم/عمة، جد/جدة)
        const familyConfig = sql.prepare("SELECT maleRole, femaleRole FROM family_config WHERE guildID = ?").get(guildId);
        
        const getGenderedTitle = (member, type) => {
            // التحقق من الرتب لتحديد الجنس
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

            const isMale = familyConfig && checkRole(familyConfig.maleRole);
            const isFemale = familyConfig && checkRole(familyConfig.femaleRole);
            // إذا لم يتم تحديد جنس، نستخدم صيغة محايدة أو مذكرة افتراضياً
            
            const titles = {
                // العلاقات المباشرة
                spouse: isMale ? "الزوج" : (isFemale ? "الزوجة" : "شريك حياة"),
                parent: isMale ? "الأب" : (isFemale ? "الأم" : "الوالد"),
                child: isMale ? "الابن" : (isFemale ? "الابنة" : "الابن"),
                sibling: isMale ? "الأخ" : (isFemale ? "الأخت" : "الشقيق"),
                
                // الأجداد والأحفاد
                grandparent: isMale ? "الجد" : (isFemale ? "الجدة" : "الجد"),
                great_grandparent: isMale ? "الجد الأكبر" : (isFemale ? "الجدة الكبرى" : "الجد الأكبر"),
                grandchild: isMale ? "الحفيد" : (isFemale ? "الحفيدة" : "الحفيد"),
                great_grandchild: isMale ? "ابن الحفيد" : (isFemale ? "ابنة الحفيد" : "سليل"),

                // الحواشي (الأعمام والأخوال)
                uncle: isMale ? "العم/الخال" : (isFemale ? "العمة/الخالة" : "قريب من الدرجة الثانية"),
                nephew: isMale ? "ابن الأخ/الأخت" : (isFemale ? "ابنة الأخ/الأخت" : "ابن الشقيق"),
                cousin: isMale ? "ابن العم/الخال" : (isFemale ? "ابنة العم/الخال" : "قريب"),

                // المصاهرة (In-Laws)
                parent_in_law: isMale ? "حمو (أبو الزوج/ة)" : (isFemale ? "حماة (أم الزوج/ة)" : "من الأصهار"),
                child_in_law: isMale ? "زوج الابنة (الصهر)" : (isFemale ? "زوجة الابن (الكنة)" : "زوج الابن/ة"),
                sibling_in_law: isMale ? "أخ الزوج/ة (أو زوج الأخت)" : (isFemale ? "أخت الزوج/ة (أو زوجة الأخ)" : "صهر"),

                // الربائب (Step Family)
                step_parent: isMale ? "زوج الأم" : (isFemale ? "زوجة الأب" : "زوج الوالد"),
                step_child: isMale ? "(ابن الزوج/ة)" : (isFemale ? "ابنة الزوج/ة)" : "ربيب"),
                step_sibling: isMale ? "أخ غير شقيق" : (isFemale ? "أخت غير شقيقة" : "أخ غير شقيق"),
            };

            return titles[type] || "قريب";
        };

        // 2. دوال جلب البيانات من الداتابيس (لتقليل التكرار)
        const getParents = (id) => sql.prepare("SELECT parentID FROM children WHERE childID = ? AND guildID = ?").all(id, guildId).map(r => r.parentID);
        const getChildren = (id) => sql.prepare("SELECT childID FROM children WHERE parentID = ? AND guildID = ?").all(id, guildId).map(r => r.childID);
        const getPartner = (id) => {
            const m = sql.prepare("SELECT partnerID FROM marriages WHERE userID = ? AND guildID = ?").get(id, guildId);
            return m ? m.partnerID : null;
        };

        // =========================================================
        // 🔍 محرك التحليل والبحث (Logic Engine)
        // =========================================================

        // المتغيرات النهائية
        let relName = "غـربـاء 🚶‍♂️";
        let relEmoji = "❔";
        let relColor = Colors.Grey;
        let relationFound = false;

        // --- 1. فحص الزواج (Direct Marriage) ---
        const partnerA = getPartner(userA.id);
        if (partnerA === userB.id) {
            relName = getGenderedTitle(userBMember, 'spouse');
            relEmoji = "💍";
            relColor = Colors.LuminousVividPink;
            relationFound = true;
        }

        if (!relationFound) {
            // --- 2. فحص النسب المباشر (Direct Lineage) ---
            const parentsA = getParents(userA.id);
            const childrenA = getChildren(userA.id);

            // هل B هو والد A؟
            if (parentsA.includes(userB.id)) {
                relName = getGenderedTitle(userBMember, 'parent');
                relEmoji = "👑";
                relColor = Colors.Gold;
                relationFound = true;
            }
            // هل B هو ابن A؟
            else if (childrenA.includes(userB.id)) {
                relName = getGenderedTitle(userBMember, 'child');
                relEmoji = "🍼";
                relColor = Colors.Blue;
                relationFound = true;
            }
        }

        if (!relationFound) {
            // --- 3. فحص الأخوة (Siblings) ---
            const parentsA = getParents(userA.id);
            const parentsB = getParents(userB.id);
            
            // يشتركون في أب واحد على الأقل
            const areSiblings = parentsA.some(pid => parentsB.includes(pid));
            
            if (areSiblings) {
                relName = getGenderedTitle(userBMember, 'sibling');
                relEmoji = "🤝";
                relColor = Colors.Green;
                relationFound = true;
            }
        }

        if (!relationFound) {
            // --- 4. فحص الأجداد والأحفاد (Grand Relations) ---
            const parentsA = getParents(userA.id);
            const childrenA = getChildren(userA.id);

            // هل B جد لـ A؟ (هل B موجود في قائمة آباء آباء A)
            let grandParentsA = [];
            parentsA.forEach(pid => grandParentsA.push(...getParents(pid)));
            
            if (grandParentsA.includes(userB.id)) {
                relName = getGenderedTitle(userBMember, 'grandparent');
                relEmoji = "👴";
                relColor = Colors.Grey;
                relationFound = true;
            }
            
            // هل B حفيد لـ A؟ (هل B موجود في قائمة أبناء أبناء A)
            if (!relationFound) {
                let grandChildrenA = [];
                childrenA.forEach(cid => grandChildrenA.push(...getChildren(cid)));
                
                if (grandChildrenA.includes(userB.id)) {
                    relName = getGenderedTitle(userBMember, 'grandchild');
                    relEmoji = "🧸";
                    relColor = Colors.Aqua;
                    relationFound = true;
                }
            }

            // فحص الجيل الرابع (الجد الأكبر / ابن الحفيد) - للموسوعة
            if (!relationFound) {
                let greatGrandParentsA = [];
                grandParentsA.forEach(gpid => greatGrandParentsA.push(...getParents(gpid)));
                if (greatGrandParentsA.includes(userB.id)) {
                    relName = getGenderedTitle(userBMember, 'great_grandparent');
                    relEmoji = "📜";
                    relationFound = true;
                }
            }
        }

        if (!relationFound) {
            // --- 5. فحص الحواشي (Uncles, Aunts, Nephews, Cousins) ---
            const parentsA = getParents(userA.id); // آبائي
            const parentsB = getParents(userB.id); // آباء الطرف الآخر

            // هل B عم/خال لـ A؟ (هل B أخ لأحد آبائي؟)
            let unclesA = [];
            parentsA.forEach(pid => {
                const grandParents = getParents(pid); // أجدادي
                // أعمامي هم أبناء أجدادي (الذين ليسوا أبي)
                grandParents.forEach(gp => {
                    const uncles = getChildren(gp).filter(u => u !== pid);
                    unclesA.push(...uncles);
                });
            });

            if (unclesA.includes(userB.id)) {
                relName = getGenderedTitle(userBMember, 'uncle');
                relEmoji = "🎩";
                relColor = Colors.Purple;
                relationFound = true;
            }

            // هل B ابن أخ/أخت لـ A؟ (هل والده هو أخي؟)
            if (!relationFound) {
                // إخوتي
                let mySiblings = [];
                parentsA.forEach(pid => {
                    const sibs = getChildren(pid).filter(s => s !== userA.id);
                    mySiblings.push(...sibs);
                });

                // هل والد B هو أحد إخوتي؟
                if (parentsB.some(pb => mySiblings.includes(pb))) {
                    relName = getGenderedTitle(userBMember, 'nephew');
                    relEmoji = "🐣";
                    relColor = Colors.LightGrey;
                    relationFound = true;
                }
            }

            // هل B ابن عم/خال لـ A؟ (Cousin)
            // (أحد آبائي وأحد آبائه إخوة)
            if (!relationFound) {
                // آبائي: parentsA
                // آباء B: parentsB
                // هل هناك أي شخص من parentsA يعتبر "أخ" لأي شخص من parentsB؟
                let parentsASiblings = [];
                parentsA.forEach(pa => {
                    const grandP = getParents(pa);
                    grandP.forEach(gp => {
                        const sibs = getChildren(gp).filter(s => s !== pa);
                        parentsASiblings.push(...sibs);
                    });
                });

                if (parentsB.some(pb => parentsASiblings.includes(pb))) {
                    relName = getGenderedTitle(userBMember, 'cousin');
                    relEmoji = "👥";
                    relColor = Colors.Teal;
                    relationFound = true;
                }
            }
        }

        if (!relationFound) {
            // --- 6. فحص المصاهرة (In-Laws) ---
            const partnerA = getPartner(userA.id); // زوجي/زوجتي
            const parentsPartnerA = partnerA ? getParents(partnerA) : [];

            // هل B هو أبو/أم زوجي؟ (Parent-in-law)
            if (partnerA && parentsPartnerA.includes(userB.id)) {
                relName = getGenderedTitle(userBMember, 'parent_in_law');
                relEmoji = "🎎";
                relColor = Colors.DarkOrange;
                relationFound = true;
            }

            // هل B هو زوج ابنتي/زوجة ابني؟ (Child-in-law)
            if (!relationFound) {
                const childrenA = getChildren(userA.id);
                // هل شريك B هو أحد أبنائي؟
                const partnerB = getPartner(userB.id);
                if (partnerB && childrenA.includes(partnerB)) {
                    relName = getGenderedTitle(userBMember, 'child_in_law');
                    relEmoji = "🤝";
                    relColor = Colors.Yellow;
                    relationFound = true;
                }
            }

            // هل B أخ/أخت زوجي؟ (Sibling-in-law - Type 1)
            if (!relationFound && partnerA) {
                const parentsPart = getParents(partnerA);
                let partnerSiblings = [];
                parentsPart.forEach(pp => {
                    const sibs = getChildren(pp).filter(s => s !== partnerA);
                    partnerSiblings.push(...sibs);
                });
                if (partnerSiblings.includes(userB.id)) {
                    relName = getGenderedTitle(userBMember, 'sibling_in_law');
                    relEmoji = "🎋";
                    relationFound = true;
                }
            }

            // هل B زوج/ة أختي/أخي؟ (Sibling-in-law - Type 2)
            if (!relationFound) {
                const parentsA = getParents(userA.id);
                let mySiblings = [];
                parentsA.forEach(p => {
                    const sibs = getChildren(p).filter(s => s !== userA.id);
                    mySiblings.push(...sibs);
                });
                // هل شريك B هو أحد إخوتي؟
                const partnerB = getPartner(userB.id);
                if (partnerB && mySiblings.includes(partnerB)) {
                    relName = getGenderedTitle(userBMember, 'sibling_in_law');
                    relEmoji = "🎋";
                    relationFound = true;
                }
            }
        }

        if (!relationFound) {
            // --- 7. فحص الربائب (Step Family) ---
            const parentsA = getParents(userA.id);
            
            // هل B هو زوج أمي / زوجة أبي؟ (Step-Parent)
            // (متزوج من أحد والدي ولكنه ليس والدي البيولوجي)
            for (const pid of parentsA) {
                const pPartner = getPartner(pid);
                if (pPartner === userB.id) {
                    // تحققنا مسبقاً أنه ليس والداً بيولوجياً (في فقرة الآباء)
                    relName = getGenderedTitle(userBMember, 'step_parent');
                    relEmoji = "🧣";
                    relColor = Colors.Orange;
                    relationFound = true;
                    break;
                }
            }

            // هل B هو ابن زوجتي/زوجي؟ (Step-Child)
            if (!relationFound) {
                const partnerA = getPartner(userA.id);
                if (partnerA) {
                    const partnerChildren = getChildren(partnerA);
                    // (تحققنا مسبقاً أنه ليس ابني البيولوجي)
                    if (partnerChildren.includes(userB.id)) {
                        relName = getGenderedTitle(userBMember, 'step_child');
                        relEmoji = "🐣";
                        relationFound = true;
                    }
                }
            }
        }

        // =========================================================
        // 📤 إرسال النتيجة النهائية
        // =========================================================

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
        
        // 🗑️ حذف الرسالة بعد 15 ثانية (للحفاظ على نظافة الشات)
        setTimeout(() => msg.delete().catch(() => {}), 15000);
    }
};
