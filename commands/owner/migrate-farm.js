const { SlashCommandBuilder, EmbedBuilder, Colors } = require("discord.js");
const farmAnimals = require('../../json/farm-animals.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('migratefarm')
        .setDescription('ADMIN ONLY: Convert farm database to stacking system'),
    
    // تأكد من صلاحيات الأدمن فقط
    name: 'migratefarm',
    category: "Owner", 
    
    async execute(interaction) {
        // حماية: تأكد أنك أنت فقط من يشغله
        // if (interaction.user.id !== "YOUR_ID") return; 

        await interaction.deferReply();
        const sql = interaction.client.sql;
        const now = Date.now();

        try {
            // 1. جلب كل البيانات القديمة
            const allRows = sql.prepare("SELECT * FROM user_farm").all();
            
            if (allRows.length === 0) {
                return interaction.editReply("قاعدة البيانات فارغة، لا يوجد شيء لدمجه.");
            }

            // 2. تجميع البيانات في الذاكرة (Stacking)
            // الصيغة: "userID-animalID": { quantity, timestamp }
            const stacks = {};
            let rowsProcessed = 0;

            for (const row of allRows) {
                const key = `${row.userID}-${row.guildID}-${row.animalID}`;
                
                if (!stacks[key]) {
                    stacks[key] = {
                        userID: row.userID,
                        guildID: row.guildID,
                        animalID: row.animalID,
                        quantity: 0,
                        // سنعتمد تاريخ أحدث شراء للحفاظ على عمر الحيوانات (أو يمكنك جعله now لتصفير الأعمار كهدية)
                        purchaseTimestamp: row.purchaseTimestamp || now 
                    };
                }
                
                // دمج الكمية (إذا كان العمود موجوداً سابقاً نستخدمه، وإلا نفترض 1)
                const qty = row.quantity || 1;
                stacks[key].quantity += qty;
                
                rowsProcessed++;
            }

            // 3. بدء عملية الحذف والإضافة (Transaction لضمان الأمان)
            const transaction = sql.transaction(() => {
                // أ. حذف الجدول القديم بالكامل (أو تفريغه)
                sql.prepare("DELETE FROM user_farm").run();

                // ب. إدخال البيانات الجديدة المدمجة
                const insertStmt = sql.prepare(`
                    INSERT INTO user_farm (guildID, userID, animalID, quantity, purchaseTimestamp, lastCollected) 
                    VALUES (?, ?, ?, ?, ?, ?)
                `);

                for (const key in stacks) {
                    const data = stacks[key];
                    insertStmt.run(
                        data.guildID, 
                        data.userID, 
                        data.animalID, 
                        data.quantity, 
                        data.purchaseTimestamp, 
                        now // إعادة تعيين وقت الحصاد
                    );
                }
            });

            transaction();

            // إحصائيات
            const newCount = Object.keys(stacks).length;
            const savings = rowsProcessed - newCount;

            const embed = new EmbedBuilder()
                .setTitle("✅ تمت عملية الدمج بنجاح (Stacking Migration)")
                .setColor(Colors.Green)
                .setDescription(`
                **الإحصائيات:**
                📥 عدد الأسطر القديمة: **${rowsProcessed.toLocaleString()}**
                📤 عدد الأسطر الجديدة (Stacking): **${newCount.toLocaleString()}**
                🗑️ تم توفير (حذف): **${savings.toLocaleString()}** سطر من قاعدة البيانات!
                
                🚀 النظام الآن جاهز للعمل بكفاءة عالية.
                `)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error(error);
            await interaction.editReply(`❌ حدث خطأ كارثي أثناء الدمج: \n\`${error.message}\``);
        }
    }
};
