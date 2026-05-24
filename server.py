from flask import Flask, request, jsonify, render_template, session, send_from_directory
import sqlite3
import json
import os
import random
import hashlib

app = Flask(__name__, static_folder='static')
app.secret_key = 'mellmap_secret_key_2026'
DB_FILE = 'mellmap.db'


def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = lambda c, r: dict(zip([col[0] for col in c.description], r))
    return conn


def init_db():
    conn = get_db()
    cursor = conn.cursor()

    if not cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='places'").fetchone():
        cursor.execute('''CREATE TABLE places (
            id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, district TEXT NOT NULL,
            category TEXT NOT NULL, breakfast_time TEXT NOT NULL, breakfast_hours TEXT,
            lat REAL NOT NULL, lng REAL NOT NULL, address TEXT NOT NULL, website TEXT,
            price TEXT NOT NULL, rating REAL NOT NULL, description TEXT, photos TEXT NOT NULL DEFAULT '[]')''')
        print(" Таблица places создана")


    if not cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").fetchone():
        cursor.execute('''CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            username TEXT UNIQUE NOT NULL, 
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            avatar TEXT,
            gender TEXT,
            age INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
        print(" Таблица users создана")
    else:
        columns_to_add = [
            ("email", "TEXT UNIQUE"),
            ("avatar", "TEXT"),
            ("gender", "TEXT"),
            ("age", "INTEGER"),
            ("created_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
        ]
        for col_name, col_type in columns_to_add:
            try:
                cursor.execute(f"ALTER TABLE users ADD COLUMN {col_name} {col_type}")
                print(f" Добавлена колонка users.{col_name}")
            except sqlite3.OperationalError:
                pass


    if not cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='reviews'").fetchone():
        cursor.execute('''CREATE TABLE reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            place_id INTEGER NOT NULL, 
            user_id INTEGER NOT NULL,
            text TEXT NOT NULL,
            rating_staff INTEGER NOT NULL CHECK(rating_staff >= 1 AND rating_staff <= 5),
            rating_food INTEGER NOT NULL CHECK(rating_food >= 1 AND rating_food <= 5),
            rating_interior INTEGER NOT NULL CHECK(rating_interior >= 1 AND rating_interior <= 5),
            rating_total INTEGER NOT NULL CHECK(rating_total >= 1 AND rating_total <= 5),
            images TEXT NOT NULL DEFAULT '[]',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (place_id) REFERENCES places (id), 
            FOREIGN KEY (user_id) REFERENCES users (id))''')
        print(" Таблица reviews создана")
    else:
        try:
            cursor.execute("ALTER TABLE reviews ADD COLUMN rating_staff INTEGER")
            cursor.execute("ALTER TABLE reviews ADD COLUMN rating_food INTEGER")
            cursor.execute("ALTER TABLE reviews ADD COLUMN rating_interior INTEGER")
            cursor.execute("ALTER TABLE reviews ADD COLUMN rating_total INTEGER")
            cursor.execute("ALTER TABLE reviews ADD COLUMN images TEXT DEFAULT '[]'")
            cursor.execute("ALTER TABLE reviews ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
            print(" Поля отзывов обновлены")
        except sqlite3.OperationalError:
            pass

    conn.commit()
    conn.close()


def load_places():
    try:
        conn = get_db()
        rows = conn.execute('SELECT * FROM places').fetchall()
        conn.close()
        for row in rows:
            try:
                row['photos'] = json.loads(row['photos']) if row['photos'] else []
            except:
                row['photos'] = []
        return rows
    except Exception as e:
        print(f" Ошибка загрузки мест: {e}")
        return []


@app.route('/api/register', methods=['POST'])
def register():
    try:
        data = request.json
        username = data.get('username')
        email = data.get('email')
        password = data.get('password')
        avatar = data.get('avatar', '')
        gender = data.get('gender')
        age = data.get('age')

        if not username or not email or not password:
            return jsonify({'error': 'Заполните обязательные поля'}), 400

        if age:
            try:
                age = int(age)
                if age < 10 or age > 100:
                    return jsonify({'error': 'Некорректный возраст'}), 400
            except ValueError:
                return jsonify({'error': 'Возраст должен быть числом'}), 400

        password_hash = hashlib.sha256(password.encode()).hexdigest()

        conn = get_db()
        try:
            conn.execute('''INSERT INTO users (username, email, password_hash, avatar, gender, age) 
                            VALUES (?, ?, ?, ?, ?, ?)''',
                         (username, email, password_hash, avatar, gender, age))
            conn.commit()
            return jsonify({'status': 'ok'})
        except sqlite3.IntegrityError as e:
            error_msg = str(e)
            if 'username' in error_msg:
                return jsonify({'error': 'Этот логин уже занят'}), 400
            elif 'email' in error_msg:
                return jsonify({'error': 'Эта почта уже зарегистрирована'}), 400
            return jsonify({'error': 'Ошибка целостности данных'}), 400
        finally:
            conn.close()
    except Exception as e:
        import traceback
        print(f"❌ Ошибка регистрации: {e}")
        print(traceback.format_exc())
        return jsonify({'error': 'Внутренняя ошибка сервера'}), 500


@app.route('/api/login', methods=['POST'])
def login():
    try:
        data = request.json
        username, password = data.get('username'), data.get('password')
        password_hash = hashlib.sha256(password.encode()).hexdigest()
        conn = get_db()
        user = conn.execute('SELECT * FROM users WHERE username = ? AND password_hash = ?',
                            (username, password_hash)).fetchone()
        conn.close()
        if user:
            session['user_id'] = user['id']
            session['username'] = user['username']
            session['avatar'] = user.get('avatar', '')
            return jsonify({'status': 'ok', 'username': user['username'], 'avatar': user.get('avatar', '')})
        return jsonify({'error': 'Неверный логин или пароль'}), 401
    except Exception as e:
        print(f"❌ Ошибка входа: {e}")
        return jsonify({'error': 'Внутренняя ошибка сервера'}), 500


@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'status': 'ok'})


@app.route('/api/me')
def check_auth():
    if 'user_id' in session:
        return jsonify({
            'logged_in': True,
            'username': session['username'],
            'avatar': session.get('avatar', '')
        })
    return jsonify({'logged_in': False})


@app.route('/api/reviews/<int:place_id>', methods=['GET'])
def get_reviews(place_id):
    try:
        conn = get_db()
        reviews = conn.execute(
            '''SELECT reviews.*, users.username, users.avatar as user_avatar 
               FROM reviews 
               JOIN users ON reviews.user_id = users.id 
               WHERE reviews.place_id = ? 
               ORDER BY reviews.created_at DESC''',
            (place_id,)).fetchall()
        conn.close()

        for review in reviews:
            try:
                review['images'] = json.loads(review['images']) if review['images'] else []
            except:
                review['images'] = []

        return jsonify(reviews)
    except Exception as e:
        print(f"❌ Ошибка загрузки отзывов: {e}")
        return jsonify([]), 500


@app.route('/api/reviews', methods=['POST'])
def add_review():
    try:
        if 'user_id' not in session:
            return jsonify({'error': 'Нужно войти в систему'}), 401

        data = request.json
        place_id = data.get('place_id')
        text = data.get('text')
        rating_staff = data.get('rating_staff')
        rating_food = data.get('rating_food')
        rating_interior = data.get('rating_interior')
        rating_total = data.get('rating_total')
        images = data.get('images', [])

        if not text or not text.strip():
            return jsonify({'error': 'Текст отзыва обязателен'}), 400

        if not all([rating_staff, rating_food, rating_interior, rating_total]):
            return jsonify({'error': 'Заполните все оценки'}), 400

        for rating_name, rating_val in [('rating_staff', rating_staff), ('rating_food', rating_food),
                                        ('rating_interior', rating_interior), ('rating_total', rating_total)]:
            try:
                rating_val = int(rating_val)
                if rating_val < 1 or rating_val > 5:
                    return jsonify({'error': f'{rating_name} должен быть от 1 до 5'}), 400
            except (ValueError, TypeError):
                return jsonify({'error': f'{rating_name} должен быть числом'}), 400

        if len(images) > 5:
            return jsonify({'error': 'Максимум 5 фото на отзыв'}), 400

        conn = get_db()
        conn.execute('''
            INSERT INTO reviews (place_id, user_id, text, rating_staff, rating_food, rating_interior, rating_total, images) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (place_id, session['user_id'], text.strip(), rating_staff, rating_food, rating_interior, rating_total,
              json.dumps(images)))
        conn.commit()
        conn.close()

        return jsonify({'status': 'ok'})
    except Exception as e:
        import traceback
        print(f"❌ Ошибка добавления отзыва: {e}")
        print(traceback.format_exc())
        return jsonify({'error': 'Внутренняя ошибка сервера'}), 500


@app.route('/api/reviews/<int:review_id>', methods=['DELETE'])
def delete_review(review_id):
    try:
        if 'user_id' not in session:
            return jsonify({'error': 'Нужно войти в систему'}), 401

        user_id = session['user_id']
        conn = get_db()

        review = conn.execute('SELECT user_id FROM reviews WHERE id = ?', (review_id,)).fetchone()

        if not review:
            conn.close()
            return jsonify({'error': 'Отзыв не найден'}), 404

        is_admin = session.get('username', '').lower() == 'admin'

        if review['user_id'] != user_id and not is_admin:
            conn.close()
            return jsonify({'error': 'Нет прав для удаления этого отзыва'}), 403

        conn.execute('DELETE FROM reviews WHERE id = ?', (review_id,))
        conn.commit()
        conn.close()

        return jsonify({'status': 'ok'})
    except Exception as e:
        print(f"❌ Ошибка удаления отзыва: {e}")
        return jsonify({'error': 'Внутренняя ошибка сервера'}), 500


@app.route('/api/places/random', methods=['GET'])
def get_random_places():
    count = request.args.get('count', default=3, type=int)
    places = load_places()
    selected = random.sample(places, min(count, len(places))) if places else []
    simplified = [{k: v for k, v in p.items() if
                   k in ['id', 'name', 'district', 'category', 'breakfast_time', 'breakfast_hours', 'price', 'rating',
                         'photos']} for p in selected]
    return jsonify(simplified)


@app.route('/api/places/random-match', methods=['GET'])
def get_random_matching_place():
    district = request.args.get('district')
    category = request.args.get('category')
    breakfast_time = request.args.get('breakfast_time')
    max_price = request.args.get('max_price', type=int)
    min_rating = request.args.get('min_rating', type=float)
    places = load_places()
    filtered = []
    for p in places:
        if district and p.get('district') != district: continue
        if category and p.get('category') != category: continue
        if breakfast_time and p.get('breakfast_time') != breakfast_time: continue
        if max_price is not None:
            try:
                clean_price = p.get('price', '0').replace('₽', '').replace(' ', '').strip()
                if int(clean_price) > max_price: continue
            except:
                continue
        if min_rating is not None and p.get('rating', 0) < min_rating: continue
        filtered.append(p)
    if not filtered:
        return jsonify({'error': 'Не найдено'}), 404
    return jsonify(random.choice(filtered))


@app.route('/api/places/<int:place_id>', methods=['PUT'])
def update_place_api(place_id):
    try:
        data = request.json
        conn = get_db()
        conn.execute(
            '''UPDATE places SET name=?, district=?, category=?, breakfast_time=?, breakfast_hours=?, lat=?, lng=?, address=?, website=?, price=?, rating=?, description=?, photos=? WHERE id=?''',
            (data['name'], data['district'], data['category'], data['breakfast_time'], data.get('breakfast_hours'),
             data['lat'], data['lng'], data['address'], data.get('website'), data['price'],
             data['rating'], data.get('description', ''), json.dumps(data.get('photos', [])), place_id))
        conn.commit()
        conn.close()
        return jsonify({'status': 'ok'})
    except Exception as e:
        print(f"❌ Ошибка обновления: {e}")
        return jsonify({'error': 'Внутренняя ошибка'}), 500


@app.route('/api/places/<int:place_id>', methods=['DELETE'])
def delete_place_api(place_id):
    try:
        conn = get_db()
        conn.execute('DELETE FROM places WHERE id = ?', (place_id,))
        conn.commit()
        conn.close()
        return jsonify({'status': 'ok'})
    except Exception as e:
        print(f"❌ Ошибка удаления: {e}")
        return jsonify({'error': 'Внутренняя ошибка'}), 500


@app.route('/api/places', methods=['GET'])
def get_places():
    return jsonify(load_places())


@app.route('/api/places', methods=['POST'])
def add_place_api():
    try:
        data = request.json
        conn = get_db()
        conn.execute(
            '''INSERT INTO places (name, district, category, breakfast_time, breakfast_hours, lat, lng, address, website, price, rating, description, photos) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
            (data['name'], data['district'], data['category'], data['breakfast_time'], data.get('breakfast_hours'),
             data['lat'], data['lng'], data['address'], data.get('website'), data['price'],
             data['rating'], data.get('description', ''), json.dumps(data.get('photos', []))))
        conn.commit()
        conn.close()
        return jsonify({'status': 'ok'})
    except Exception as e:
        print(f"❌ Ошибка добавления места: {e}")
        return jsonify({'error': 'Внутренняя ошибка'}), 500


@app.route('/api/profile', methods=['GET'])
def get_profile():
    if 'user_id' not in session:
        return jsonify({'error': 'Нужно войти в систему'}), 401

    user_id = session['user_id']
    conn = get_db()

    user = conn.execute('SELECT id, username, email, avatar, gender, age FROM users WHERE id = ?',
                        (user_id,)).fetchone()

    if not user:
        conn.close()
        return jsonify({'error': 'Пользователь не найден'}), 404

    review_count = conn.execute('SELECT COUNT(*) as count FROM reviews WHERE user_id = ?', (user_id,)).fetchone()[
        'count']

    reviews = conn.execute('''
        SELECT r.text, r.rating_total, r.rating_staff, r.rating_food, r.rating_interior, 
               r.images, r.created_at, p.name as place_name 
        FROM reviews r 
        JOIN places p ON r.place_id = p.id 
        WHERE r.user_id = ? 
        ORDER BY r.created_at DESC
    ''', (user_id,)).fetchall()

    for review in reviews:
        try:
            review['images'] = json.loads(review['images']) if review['images'] else []
        except:
            review['images'] = []

    conn.close()

    return jsonify({
        'id': user['id'],
        'username': user['username'],
        'email': user['email'],
        'avatar': user.get('avatar', ''),
        'gender': user.get('gender', ''),
        'age': user.get('age'),
        'review_count': review_count,
        'reviews': reviews
    })


@app.route('/api/profile', methods=['PUT'])
def update_profile():
    if 'user_id' not in session:
        return jsonify({'error': 'Нужно войти в систему'}), 401

    user_id = session['user_id']
    data = request.json

    username = data.get('username')
    gender = data.get('gender')
    age = data.get('age')
    avatar = data.get('avatar', '')

    if not username:
        return jsonify({'error': 'Логин обязателен'}), 400

    if age:
        try:
            age = int(age)
            if age < 10 or age > 100:
                return jsonify({'error': 'Некорректный возраст'}), 400
        except ValueError:
            return jsonify({'error': 'Возраст должен быть числом'}), 400

    conn = get_db()

    existing_user = conn.execute('SELECT id FROM users WHERE username = ? AND id != ?', (username, user_id)).fetchone()
    if existing_user:
        conn.close()
        return jsonify({'error': 'Этот логин уже занят другим пользователем'}), 400

    try:
        conn.execute('''
            UPDATE users 
            SET username = ?, gender = ?, age = ?, avatar = ? 
            WHERE id = ?
        ''', (username, gender, age, avatar, user_id))
        conn.commit()

        session['username'] = username
        session['avatar'] = avatar

        conn.close()
        return jsonify({
            'status': 'ok',
            'username': username,
            'avatar': avatar
        })
    except Exception as e:
        conn.rollback()
        conn.close()
        print(f"❌ Ошибка обновления профиля: {e}")
        return jsonify({'error': 'Внутренняя ошибка сервера'}), 500


@app.route('/')
def index():
    return render_template('main_page.html')


@app.route('/map')
def map_page():
    return render_template('map.html')


@app.route('/admin')
def admin():
    return render_template('admin.html')


@app.route('/<path:path>')
def static_files(path):
    try:
        return send_from_directory('static', path)
    except FileNotFoundError:
        return "Файл не найден", 404


if __name__ == '__main__':
    init_db()
    print("\n Сервер запущен!")
    print(" Главная: http://localhost:5000")
    print(" Карта: http://localhost:5000/map")
    print(" Админка: http://localhost:5000/admin\n")
    app.run(host='0.0.0.0', port=5000, debug=True)