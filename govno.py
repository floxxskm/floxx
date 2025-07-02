import sys
import os
import shutil
import subprocess
from mutagen.mp3 import MP3

from PyQt6.QtWidgets import (
    QApplication, QWidget, QPushButton, QVBoxLayout, QLabel,
    QFileDialog, QTextEdit, QHBoxLayout, QMessageBox
)
from PyQt6.QtCore import Qt, QThread, pyqtSignal


def get_bitrate_kbps(file_path):
    try:
        audio = MP3(file_path)
        return audio.info.bitrate // 1000
    except Exception:
        return None


class ConverterThread(QThread):
    log_signal = pyqtSignal(str)
    finished_signal = pyqtSignal()

    def __init__(self, input_dir, output_dir, target_bitrate=224):
        super().__init__()
        self.input_dir = input_dir
        self.output_dir = output_dir
        self.target_bitrate = target_bitrate

    def run(self):
        if not os.path.exists(self.output_dir):
            os.makedirs(self.output_dir)

        for filename in os.listdir(self.input_dir):
            if not filename.lower().endswith(('.mp3', '.wav', '.aac', '.m4a', '.ogg', '.opus')):
                continue

            input_path = os.path.join(self.input_dir, filename)
            output_path = os.path.join(self.output_dir, filename)

            bitrate = get_bitrate_kbps(input_path)
            if bitrate is None:
                self.log_signal.emit(f"[!] Пропускаем {filename}: не удалось определить битрейт")
                continue

            if bitrate > self.target_bitrate:
                self.log_signal.emit(f"Перекодируем {filename}: {bitrate} kbps → {self.target_bitrate} kbps")
                cmd = [
                    'ffmpeg', '-y', '-i', input_path,
                    '-b:a', f'{self.target_bitrate}k',
                    '-vn', output_path
                ]
                process = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                if process.returncode != 0:
                    self.log_signal.emit(f"[Ошибка] При конвертации {filename}")
            else:
                self.log_signal.emit(f"Копируем {filename}, битрейт {bitrate} kbps ≤ {self.target_bitrate} kbps")
                shutil.copy2(input_path, output_path)

        self.finished_signal.emit()


class MainWindow(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Конвертер аудио в 224 kbps")
        self.setMinimumSize(600, 400)

        layout = QVBoxLayout()

        # Выбор входной папки
        self.input_label = QLabel("Входная папка: не выбрана")
        btn_input = QPushButton("Выбрать входную папку")
        btn_input.clicked.connect(self.select_input_dir)

        # Выбор выходной папки
        self.output_label = QLabel("Выходная папка: не выбрана")
        btn_output = QPushButton("Выбрать выходную папку")
        btn_output.clicked.connect(self.select_output_dir)

        # Кнопка запуска
        self.btn_start = QPushButton("Начать конвертацию")
        self.btn_start.clicked.connect(self.start_conversion)
        self.btn_start.setEnabled(False)

        # Лог
        self.log_text = QTextEdit()
        self.log_text.setReadOnly(True)

        # Сборка layout
        layout.addWidget(self.input_label)
        layout.addWidget(btn_input)
        layout.addWidget(self.output_label)
        layout.addWidget(btn_output)
        layout.addWidget(self.btn_start)
        layout.addWidget(self.log_text)

        self.setLayout(layout)

        self.input_dir = None
        self.output_dir = None
        self.thread = None

    def select_input_dir(self):
        dir_path = QFileDialog.getExistingDirectory(self, "Выберите входную папку")
        if dir_path:
            self.input_dir = dir_path
            self.input_label.setText(f"Входная папка: {dir_path}")
            self.check_ready()

    def select_output_dir(self):
        dir_path = QFileDialog.getExistingDirectory(self, "Выберите выходную папку")
        if dir_path:
            self.output_dir = dir_path
            self.output_label.setText(f"Выходная папка: {dir_path}")
            self.check_ready()

    def check_ready(self):
        self.btn_start.setEnabled(bool(self.input_dir and self.output_dir))

    def start_conversion(self):
        if not (self.input_dir and self.output_dir):
            QMessageBox.warning(self, "Ошибка", "Выберите обе папки!")
            return

        self.btn_start.setEnabled(False)
        self.log_text.clear()
        self.log_text.append("Запуск конвертации...\n")

        self.thread = ConverterThread(self.input_dir, self.output_dir)
        self.thread.log_signal.connect(self.append_log)
        self.thread.finished_signal.connect(self.conversion_finished)
        self.thread.start()

    def append_log(self, text):
        self.log_text.append(text)

    def conversion_finished(self):
        self.log_text.append("\nКонвертация завершена!")
        self.btn_start.setEnabled(True)


if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = MainWindow()
    window.show()
    sys.exit(app.exec())
