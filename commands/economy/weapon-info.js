const { EmbedBuilder, Colors, SlashCommandBuilder } = require("discord.js");
const weaponsConfig = require('../../json/weapons-config.json');
const { getUserRace, getWeaponData, cleanDisplayName } = require('../../handlers/pvp-core.js');

const EMOJI_MORA = '<:mora:1435647151349698621>';

const RACE_TRANSLATIONS = new Map([
    ['Human', 'بشري'],
    ['Dragon', 'تنين'],
    ['Elf', 'الف'],
    ['Dark Elf', 'الف الظلام'],
    ['Seraphim', 'سيرافيم'],
    ['Demon', 'شيطان'],
    ['Vampire', 'مصاص دماء'],
    ['Spirit', 'روح'],
    ['Dwarf', 'قزم'],
    ['Ghoul', 'غول'],
    ['Hybrid', 'نصف وحش']
]);

const REVERSE_RACE_TRANSLATIONS = new Map(
    Array.from(RACE_TRANSLATIONS, a => [a[1].toLowerCase(), a[0]])
);

const WEAPON_TIPS = new Map([
    ['Dragon', 'سلاح التنين يسبب ضرراً هائلاً. قم بزيادة مستواه لزيادة الضرر الأساسي.'],
    ['Human', 'سلاح متوازن. قم بتطويره لزيادة الضرر بشكل ثابت مع كل مستوى.'],
    ['Seraphim', 'سلاح سماوي. تطويره يزيد من ضرره بشكل ملحوظ.'],
    ['Demon', 'سلاح مدمر. تكلفة تطويره تزيد بسرعة، لكن ضرره يستحق ذلك.'],
    ['Elf', 'سلاح رشيق. ضرره الأساسي متوسط وتكلفته معقولة.'],
    ['Dark Elf', 'سلاح ظلامي. يشتهر بضرره العالي وتكلفته المرتفعة.'],
    ['Vampire', 'سلاح مصاص الدماء. كل مستوى يزيد من ضرره بشكل جيد.'],
    ['Hybrid', 'سلاح هجين. ضرره وتكلفته متوسطان ومتوازنان.'],
    ['Spirit', 'سلاح الأرواح. يركز على ضرر أساسي جيد وتطويرات مكلفة.'],
    ['Dwarf', 'سلاح الأقزام. قوي ومتين، ضرره يزداد بشكل جيد.'],
    ['Ghoul', 'سلاح الغيلان. تكلفته الأولية منخفضة ولكن ضرره يزداد بقوة.']
]);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('سلاح')
        .setDescription('يعرض تفاصيل سلاحك، أو سلاح عضو آخر، أو سلاح عرق معين.')
        .addUserOption(option =>
            option.setName('المستخدم')
            .setDescription('عرض سلاح مستخدم معين (اتركه فارغاً لعرض سلاحك)')
            .setRequired(false))
        .addStringOption(option =>
            option.setName('اسم-السلاح')
            .setDescription('البحث عن نوع سلاح أو عرق معين (مثل "تنين")')
            .setRequired(false)
            .setAutocomplete(true)),

    name: 'weapon-info',
    aliases: ['سلاح', 'شرح-سلاح', 'سلاحي'],
    category: "Economy",
    description: 'يعرض تفاصيل سلاحك، أو سلاح عضو آخر، أو سلاح عرق معين.',

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused().toLowerCase();

        const filtered = weaponsConfig.filter(w => {
            const translatedRace = RACE_TRANSLATIONS.get(w.race) || '';
            return w.name.toLowerCase().includes(focusedValue) ||
                   w.race.toLowerCase().includes(focusedValue) ||
                   translatedRace.toLowerCase().includes(focusedValue);
        });

        await interaction.respond(
            filtered.slice(0, 25).map(w => ({
                name: `${w.emoji} ${w.name} (${RACE_TRANSLATIONS.get(w.race) || w.race})`,
                value: w.id
            }))
        );
    },

    async execute(interactionOrMessage, args) {

        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, member;
        let targetMember, searchQuery;

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            member = interaction.member;

            targetMember = interaction.options.getMember('المستخدم');
            searchQuery = interaction.options.getString('اسم-السلاح');

            if (!targetMember && !searchQuery) {
                targetMember = member;
            }
            await interaction.deferReply();
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            member = message.member;

            targetMember = message.mentions.members.first();
            searchQuery = args.length > 0 ? args.join(' ').toLowerCase() : null;

            if (!targetMember && !searchQuery) {
                 targetMember = member;
            } else if (targetMember) {
                 searchQuery = null;
            } else if (message.content.endsWith('سلاحي')) {
                 targetMember = member;
                 searchQuery = null;
            }
        }

        const reply = async (payload) => {
            if (isSlash) {
                return interaction.editReply(payload);
            } else {
                return message.channel.send(payload);
            }
        };

        const replyError = async (content) => {
            const payload = { content };
            if (isSlash) {
                payload.ephemeral = true;
                return interaction.editReply(payload);
            } else {
                return message.reply(payload);
            }
        };

        const sql = client.sql;

        if (targetMember) {
            const user = targetMember.user;
            const cleanName = cleanDisplayName(user.displayName);

            const userRace = getUserRace(targetMember, sql);
            const weaponData = getWeaponData(sql, targetMember);

            if (!userRace) {
                return replyError(`❌ **${cleanName}** لا يمتلك عرقاً حالياً.`);
            }

            if (!weaponData) {
                return replyError(`❌ **${cleanName}** يمتلك عرق \`${userRace.raceName}\` لكنه لم يشتري السلاح بعد من المتجر.`);
            }

            const description = [
                `✥ **الـعـرق:** \`${weaponData.race}\``,
                `✶ **المستوى الحالي:** \`Lv. ${weaponData.currentLevel} / ${weaponData.max_level}\``,
                `✶ **الضرر الحالي:** \`${weaponData.currentDamage}\` DMG`,
            ].join('\n');

            const embed = new EmbedBuilder()
                .setTitle(`${weaponData.emoji} سلاح ${cleanName}`)
                .setColor(Colors.Green)
                .setThumbnail(weaponData.image || null)
                .addFields(
                    { name: "✶ مواصفات السلاح الحالي", value: description }
                );

            return reply({ embeds: [embed] });

        } else if (searchQuery) {

            let finalQuery = searchQuery.toLowerCase();
            const arabicMatch = REVERSE_RACE_TRANSLATIONS.get(finalQuery);
            if (arabicMatch) {
                finalQuery = arabicMatch.toLowerCase();
            }

            const weapon = weaponsConfig.find(w => 
                w.id.toLowerCase() === finalQuery ||
                w.name.toLowerCase().includes(finalQuery) || 
                w.race.toLowerCase().includes(finalQuery)
            );

            if (!weapon) {
                return replyError('❌ لم أتمكن من العثور على سلاح أو عرق بهذا الاسم.');
            }

            const description = [
                `✥ **الـعـرق:** \`${weapon.race}\``,
                `✶ **الضرر الأساسي (Lv.1):** \`${weapon.base_damage}\` DMG`,
                `✶ **الزيادة لكل تطوير:** \`+${weapon.damage_increment}\` DMG`,
                `✶ **أقصى مستوى:** \`Lv. ${weapon.max_level}\``,
                `\n`,
                `✬ **السعر الأساسي (Lv.1):** \`${weapon.base_price.toLocaleString()}\` ${EMOJI_MORA}`,
                `✬ **زيادة السعر لكل لفل:** \`+${weapon.price_increment.toLocaleString()}\` ${EMOJI_MORA}`,
            ].join('\n');

            const embed = new EmbedBuilder()
                .setTitle(`${weapon.emoji} ${weapon.name}`)
                .setColor(Colors.Blue)
                .setThumbnail(weapon.image || null)
                .addFields(
                    { name: "✶ المواصفات الأساسية", value: description },
                    { name: "✥ نصيحة للحصول عليه", value: `هذا السلاح مخصص لعرق **${weapon.race}** فقط. يمكنك شراؤه وتطويره من المتجر.` }
                );

            return reply({ embeds: [embed] });
        } else {
            return replyError('يرجى تحديد مستخدم أو اسم سلاح.');
        }
    }
};