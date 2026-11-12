CREATE DATABASE IF NOT EXISTS fishly_pos;
USE fishly_pos;

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(80) NOT NULL,
  pin_hash VARCHAR(100) NOT NULL,
  role ENUM('admin','cashier') NOT NULL DEFAULT 'cashier',
  active TINYINT(1) NOT NULL DEFAULT 1,
  token_version INT NOT NULL DEFAULT 0
);

CREATE TABLE categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(60) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT NOT NULL,
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  is_combo TINYINT(1) NOT NULL DEFAULT 0,
  unit_cost DECIMAL(10,2) NULL,
  stock INT NOT NULL DEFAULT 0,
  reorder_level INT NOT NULL DEFAULT 10,
  expiry_date DATE NULL,
  photo_url VARCHAR(255) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  INDEX idx_products_active_category (active, category_id, id),
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE TABLE combo_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  combo_id INT NOT NULL,
  item_id INT NOT NULL,
  qty INT NOT NULL DEFAULT 1,
  FOREIGN KEY (combo_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES products(id)
);

CREATE TABLE customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(40) NULL,
  email VARCHAR(120) NULL,
  address VARCHAR(255) NULL,
  notes VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE stock_adjustments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  adjustment_type ENUM('add','remove','wastage','opening','count') NOT NULL,
  quantity INT NOT NULL,
  reason VARCHAR(200) NULL,
  user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE suppliers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  phone VARCHAR(40) NULL,
  email VARCHAR(120) NULL,
  address VARCHAR(255) NULL,
  notes VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE purchases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  supplier_id INT NULL,
  reference VARCHAR(40) NULL,
  status ENUM('received','draft') NOT NULL DEFAULT 'received',
  total DECIMAL(10,2) NOT NULL DEFAULT 0,
  paid TINYINT NOT NULL DEFAULT 0,
  notes VARCHAR(500) NULL,
  user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE purchase_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  purchase_id INT NOT NULL,
  product_id INT NOT NULL,
  qty INT NOT NULL,
  unit_cost DECIMAL(10,2) NULL,
  total DECIMAL(10,2) NOT NULL,
  FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE shifts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  opening_cash DECIMAL(10,2) NOT NULL,
  counted_cash DECIMAL(10,2) NULL,
  expected_cash DECIMAL(10,2) NULL,
  variance DECIMAL(10,2) NULL,
  counted_gcash DECIMAL(10,2) NULL,
  expected_gcash DECIMAL(10,2) NULL,
  notes VARCHAR(500) NULL,
  opened_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMP NULL,
  INDEX (user_id, closed_at),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_no VARCHAR(20) NOT NULL,
  order_type ENUM('dine_in','take_out') NOT NULL DEFAULT 'dine_in',
  status ENUM('pending','preparing','ready','completed','cancelled') NOT NULL DEFAULT 'completed',
  payment_method ENUM('cash','gcash') NOT NULL,
  payment_reference VARCHAR(80) NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  discount DECIMAL(10,2) NOT NULL DEFAULT 0,
  total DECIMAL(10,2) NOT NULL,
  cash_received DECIMAL(10,2) NULL,
  change_due DECIMAL(10,2) NULL,
  note VARCHAR(200) NULL,
  cashier_id INT NOT NULL,
  customer_id INT NULL,
  shift_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_created (created_at),
  INDEX idx_status (status),
  INDEX idx_orders_created_status (created_at, status),
  INDEX idx_shift (shift_id),
  FOREIGN KEY (cashier_id) REFERENCES users(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (shift_id) REFERENCES shifts(id)
);

CREATE TABLE order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  unit_cost DECIMAL(10,2) NULL,
  qty INT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE order_stock (
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL,
  PRIMARY KEY (order_id, product_id),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE refunds (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL UNIQUE,
  shift_id INT NULL,
  user_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  payment_method VARCHAR(20) NOT NULL,
  reference VARCHAR(80) NULL,
  restock TINYINT NOT NULL,
  reason VARCHAR(200) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (shift_id) REFERENCES shifts(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE cash_movements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  shift_id INT NOT NULL,
  user_id INT NOT NULL,
  direction ENUM('in','out') NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  reason VARCHAR(200) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shift_id) REFERENCES shifts(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE expenses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category VARCHAR(20) NOT NULL DEFAULT 'other',
  title VARCHAR(150) NULL,
  description VARCHAR(150) NOT NULL,
  qty INT NULL,
  unit VARCHAR(20) NULL,
  unit_cost DECIMAL(10,2) NULL,
  amount DECIMAL(10,2) NOT NULL,
  receipt_url VARCHAR(255) NULL,
  purchase_id INT NULL UNIQUE,
  user_id INT NULL,
  voided_at TIMESTAMP NULL,
  voided_by INT NULL,
  void_reason VARCHAR(200) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_expenses_created_voided (created_at, voided_at),
  FOREIGN KEY (purchase_id) REFERENCES purchases(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (voided_by) REFERENCES users(id)
);

CREATE TABLE mutation_requests (
  user_id INT NOT NULL,
  scope VARCHAR(40) NOT NULL,
  request_id VARCHAR(64) NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  response_json LONGTEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, scope, request_id)
);

CREATE TABLE expense_imports (
  file_hash CHAR(64) PRIMARY KEY,
  user_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE inventory_lock (id INT PRIMARY KEY);
INSERT INTO inventory_lock (id) VALUES (1);

INSERT INTO categories (id, name, sort_order) VALUES
  (1,'Poppers only (5 pcs)',1), (2,'Poppers with rice (5 pcs)',2), (3,'Poppers with rice + drink',3), (4,'Drinks',4), (5,'Pastillas',5);

-- Prices are placeholders; edit them in the Products page.
INSERT INTO products (category_id, code, name, price, stock) VALUES
  (1,'FP-R','Regular poppers only (5 pcs)',30,100), (1,'FP-S','Spicy poppers only (5 pcs)',30,100), (1,'FP-BBQ','Barbecue poppers only (5 pcs)',30,100),
  (2,'RC-R','Regular poppers with rice (5 pcs)',55,100), (2,'RC-S','Spicy poppers with rice (5 pcs)',55,100), (2,'RC-BBQ','Barbecue poppers with rice (5 pcs)',55,100),
  (3,'CM-R','Combo Regular poppers + rice + drink',70,100), (3,'CM-S','Combo Spicy poppers + rice + drink',70,100), (3,'CM-BBQ','Combo Barbecue poppers + rice + drink',70,100),
  (4,'MJ','Melon juice',20,100),
  (5,'PS-C','Pastillas Coffee',10,100), (5,'PS-M','Pastillas Milo',10,100), (5,'PS-O','Pastillas Oreo',10,100);
