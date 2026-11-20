// Robot 2027 V1.4 - Cấu hình hệ thống & Kho chủ đề khởi đầu Offline
window.ROBOT_CONFIG = {
  VERSION: '1.4.0',
  DEFAULT_BASE_URL: 'https://khotrithucso.io.vn/robot2027_2_4/test1',
  DEFAULT_API_URL: 'https://khotrithucso.io.vn/robot2027_2_4/test1/api.php',
  DEFAULT_USER_API_URL: 'https://khotrithucso.io.vn/robot2027_2_4/test1/api_user.php',
  DEFAULT_YOUTUBE_URL: 'https://khotrithucso.io.vn/robot2027_2_4/test1/youtube.php',
  DEFAULT_GAMES_URL: 'https://khotrithucso.io.vn/robot2027_2_4/test1/games.php',
  DEFAULT_PARENT_PIN: '1234',
  MANUFACTURER_EXIT_PIN: '202799',
  SLEEP_TIMEOUT_MS: 60000,
  STAR_COST_PER_10_MIN: 3,

  // 8 chủ đề tích hợp sẵn chạy 100% Offline ngay khi mới cài APK (có thể đồng bộ thêm 32 gói từ Server)
  BUILTIN_TOPICS: [
    {
      id: 'greetings',
      name: 'Chào Hỏi & Giao Tiếp',
      icon: '👋',
      items: [
        { id: 1, en: 'Hello! How are you today?', vi: 'Xin chào! Hôm nay bạn khỏe không?', spell: { hello: 'H-E-L-L-O', today: 'T-O-D-A-Y' } },
        { id: 2, en: 'I am happy to see you.', vi: 'Mình rất vui được gặp bạn.', spell: { happy: 'H-A-P-P-Y', see: 'S-E-E' } },
        { id: 3, en: 'What is your name?', vi: 'Tên của bạn là gì?', spell: { what: 'W-H-A-T', name: 'N-A-M-E' } },
        { id: 4, en: 'Nice to meet you my friend.', vi: 'Rất vui được làm quen với bạn của tôi.', spell: { nice: 'N-I-C-E', friend: 'F-R-I-E-N-D' } },
        { id: 5, en: 'Thank you very much!', vi: 'Cảm ơn bạn rất nhiều!', spell: { thank: 'T-H-A-N-K', much: 'M-U-C-H' } }
      ]
    },
    {
      id: 'animals',
      name: 'Thế Giới Động Vật',
      icon: '🦁',
      items: [
        { id: 1, en: 'The cute rabbit has long ears.', vi: 'Chú thỏ dễ thương có đôi tai dài.', spell: { cute: 'C-U-T-E', rabbit: 'R-A-B-B-I-T', ears: 'E-A-R-S' } },
        { id: 2, en: 'An elephant is very big and strong.', vi: 'Một chú voi thì rất to lớn và khỏe mạnh.', spell: { elephant: 'E-L-E-P-H-A-N-T', strong: 'S-T-R-O-N-G' } },
        { id: 3, en: 'The little cat likes drinking milk.', vi: 'Chú mèo nhỏ thích uống sữa.', spell: { little: 'L-I-T-T-L-E', milk: 'M-I-L-K' } },
        { id: 4, en: 'Birds can fly high in the blue sky.', vi: 'Những chú chim có thể bay cao trên bầu trời xanh.', spell: { birds: 'B-I-R-D-S', sky: 'S-K-Y' } },
        { id: 5, en: 'Dolphins are smart ocean animals.', vi: 'Cá heo là loài động vật đại dương thông minh.', spell: { dolphins: 'D-O-L-P-H-I-N-S', ocean: 'O-C-E-A-N' } }
      ]
    },
    {
      id: 'family',
      name: 'Gia Đình Yêu Thương',
      icon: '🏡',
      items: [
        { id: 1, en: 'I love my mother and father.', vi: 'Con yêu mẹ và bố của con.', spell: { mother: 'M-O-T-H-E-R', father: 'F-A-T-H-E-R' } },
        { id: 2, en: 'My grandmother tells warm stories.', vi: 'Bà của em kể những câu chuyện ấm áp.', spell: { grandmother: 'G-R-A-N-D-M-O-T-H-E-R', stories: 'S-T-O-R-I-E-S' } },
        { id: 3, en: 'We eat dinner together every evening.', vi: 'Chúng tôi ăn tối cùng nhau mỗi buổi tối.', spell: { dinner: 'D-I-N-N-E-R', together: 'T-O-G-E-T-H-E-R' } },
        { id: 4, en: 'My little brother likes toy cars.', vi: 'Em trai nhỏ của mình thích ô tô đồ chơi.', spell: { brother: 'B-R-O-T-H-E-R', cars: 'C-A-R-S' } }
      ]
    },
    {
      id: 'fruits_food',
      name: 'Trái Cây & Món Ngon',
      icon: '🍎',
      items: [
        { id: 1, en: 'An apple a day keeps you healthy.', vi: 'Mỗi ngày một quả táo giúp bạn khỏe mạnh.', spell: { apple: 'A-P-P-L-E', healthy: 'H-E-A-L-T-H-Y' } },
        { id: 2, en: 'Yellow bananas are sweet and soft.', vi: 'Những quả chuối vàng thì ngọt và mềm.', spell: { banana: 'B-A-N-A-N-A', sweet: 'S-W-E-E-T' } },
        { id: 3, en: 'Please drink clean water every day.', vi: 'Hãy uống nước sạch mỗi ngày nhé.', spell: { water: 'W-A-T-E-R', clean: 'C-L-E-A-N' } },
        { id: 4, en: 'I like orange juice for breakfast.', vi: 'Mình thích nước cam cho bữa sáng.', spell: { orange: 'O-R-A-N-G-E', breakfast: 'B-R-E-A-K-F-A-S-T' } }
      ]
    },
    {
      id: 'colors_shapes',
      name: 'Màu Sắc & Hình Khối',
      icon: '🎨',
      items: [
        { id: 1, en: 'The bright sun is yellow and round.', vi: 'Mặt trời rực rỡ có màu vàng và hình tròn.', spell: { yellow: 'Y-E-L-L-O-W', round: 'R-O-U-N-D' } },
        { id: 2, en: 'A rainbow has seven beautiful colors.', vi: 'Cầu vồng có bảy màu sắc tuyệt đẹp.', spell: { rainbow: 'R-A-I-N-B-O-W', seven: 'S-E-V-E-N' } },
        { id: 3, en: 'This book is a blue rectangle.', vi: 'Quyển sách này là một hình chữ nhật màu xanh dương.', spell: { book: 'B-O-O-K', rectangle: 'R-E-C-T-A-N-G-L-E' } }
      ]
    },
    {
      id: 'school',
      name: 'Trường Học Vui Nhộn',
      icon: '🎒',
      items: [
        { id: 1, en: 'I go to school with my backpack.', vi: 'Mình đến trường cùng chiếc ba lô của mình.', spell: { school: 'S-C-H-O-O-L', backpack: 'B-A-C-K-P-A-C-K' } },
        { id: 2, en: 'Our teacher writes on the board.', vi: 'Cô giáo của chúng mình viết lên bảng.', spell: { teacher: 'T-E-A-C-H-E-R', board: 'B-O-A-R-D' } },
        { id: 3, en: 'Let us read and count together.', vi: 'Chúng ta hãy cùng nhau đọc và đếm nhé.', spell: { read: 'R-E-A-D', count: 'C-O-U-N-T' } }
      ]
    },
    {
      id: 'weather_nature',
      name: 'Thời Tiết & Thiên Nhiên',
      icon: '🌦️',
      items: [
        { id: 1, en: 'Today is sunny and breezy.', vi: 'Hôm nay trời nắng đẹp và có gió nhẹ.', spell: { sunny: 'S-U-N-N-Y', breezy: 'B-R-E-E-Z-Y' } },
        { id: 2, en: 'Take an umbrella when it rains.', vi: 'Hãy mang theo ô khi trời mưa nhé.', spell: { umbrella: 'U-M-B-R-E-L-L-A', rains: 'R-A-I-N-S' } },
        { id: 3, en: 'Green trees give us fresh air.', vi: 'Cây xanh mang lại cho chúng ta không khí trong lành.', spell: { trees: 'T-R-E-E-S', fresh: 'F-R-E-S-H' } }
      ]
    },
    {
      id: 'space_science',
      name: 'Vũ Trụ & Khoa Học',
      icon: '🚀',
      items: [
        { id: 1, en: 'Rockets fly fast to the moon.', vi: 'Tên lửa bay thật nhanh lên mặt trăng.', spell: { rockets: 'R-O-C-K-E-T-S', moon: 'M-O-O-N' } },
        { id: 2, en: 'Earth is our home planet.', vi: 'Trái Đất là hành tinh ngôi nhà của chúng ta.', spell: { earth: 'E-A-R-T-H', planet: 'P-L-A-N-E-T' } },
        { id: 3, en: 'Robots help people learn every day.', vi: 'Robot giúp con người học tập mỗi ngày.', spell: { robots: 'R-O-B-O-T-S', learn: 'L-E-A-R-N' } }
      ]
    }
  ]
};
